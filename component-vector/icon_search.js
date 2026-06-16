#!/usr/bin/env node
'use strict';

/**
 * 图标向量检索模块（ES KNN）。
 *
 * 作为库：
 *   const { searchIcon } = require('./icon_search');
 *   const results = await searchIcon('下载文件', 5);
 *
 * CLI：
 *   node icon_search.js "下载图标"
 *   MOCK_EMBED=1 node icon_search.js "设置"
 */

const fs     = require('fs');
const path   = require('path');
const OpenAI = require('openai');
const { getClient } = require('./es_client');

// ── 配置 ─────────────────────────────────────────────────────────────────────

const envFile = path.resolve(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const idx = t.indexOf('=');
    if (idx < 0) return;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  });
}

const MOCK_MODE          = /^(1|true|yes)$/i.test(process.env.MOCK_EMBED || '');
const EMBEDDING_BASE_URL = process.env.EMBEDDING_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const EMBEDDING_MODEL    = process.env.EMBEDDING_MODEL    || 'text-embedding-v3';
const EMBEDDING_DIM      = Number(process.env.EMBEDDING_DIM) || 1024;
const ES_INDEX           = process.env.ICON_ES_INDEX || 'component_icons';

const openai = new OpenAI({
  apiKey:  process.env.DASHSCOPE_API_KEY,
  baseURL: EMBEDDING_BASE_URL,
  timeout: 30_000,
});

// ── Embedding ─────────────────────────────────────────────────────────────────

function mockEmbedding() {
  const v = Array.from({ length: EMBEDDING_DIM }, () => Math.random() * 2 - 1);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map(x => x / norm);
}

async function embedQuery(text) {
  if (MOCK_MODE) return mockEmbedding();
  const resp = await openai.embeddings.create({
    model:           EMBEDDING_MODEL,
    input:           [text],
    dimensions:      EMBEDDING_DIM,
    encoding_format: 'float',
  });
  return resp.data[0].embedding;
}

// ── 主检索函数 ────────────────────────────────────────────────────────────────

/**
 * @param {string} query  - 自然语言描述
 * @param {number} topK   - 返回条数，默认 1
 * @returns {Promise<Array<{score, icon_id, name, description}>>}
 */
async function searchIcon(query, topK = 1) {
  const es       = getClient();
  const queryVec = await embedQuery(query);

  const resp = await es.search({
    index: ES_INDEX,
    knn: {
      field:          'embedding',
      query_vector:   queryVec,
      k:              topK,
      num_candidates: Math.max(topK * 10, 50),
    },
    _source: ['icon_id', 'name', 'english_name', 'description', 'text'],
    size: topK,
  });

  return resp.hits.hits.map(hit => ({
    score:        hit._score,
    icon_id:      hit._source.icon_id,
    name:         hit._source.name,
    english_name: hit._source.english_name,
    description:  hit._source.description,
  }));
}

module.exports = { searchIcon };

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const query = process.argv[2];
  const topK  = Number(process.argv[3] || 5);

  if (!query) {
    console.error('用法: node icon_search.js "<查询>" [topK]');
    process.exit(1);
  }

  (async () => {
    console.log(`查询: "${query}"  topK=${topK}  ${MOCK_MODE ? '[MOCK]' : `[${EMBEDDING_MODEL}]`}\n`);
    const results = await searchIcon(query, topK);
    results.forEach((r, i) => {
      console.log(`#${i + 1}  score=${r.score?.toFixed(4)}`);
      console.log(`  icon_id:     ${r.icon_id}`);
      console.log(`  name:        ${r.name}`);
      console.log(`  description: ${r.description}`);
      console.log();
    });
  })().catch(err => { console.error(err.message); process.exit(1); });
}
