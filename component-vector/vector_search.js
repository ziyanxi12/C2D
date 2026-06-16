#!/usr/bin/env node
'use strict';

/**
 * 变体向量检索模块（ES KNN）。
 *
 * 作为库：
 *   const { searchVariant } = require('./vector_search');
 *   const results = await searchVariant('主要按钮 悬停状态 小号', 3);
 *
 * CLI 测试：
 *   node vector_search.js "主要按钮 悬停状态 小号"
 *   MOCK_EMBED=1 node vector_search.js "文字链接 禁用"
 */

const fs   = require('fs');
const path = require('path');
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
const ES_INDEX           = process.env.ES_INDEX || 'component_variants';

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
 * @returns {Promise<Array<{score, symbol_id, variant_key, component_set_key, component_set_resolved, path}>>}
 */
async function searchVariant(query, topK = 1) {
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
    _source: ['symbol_id', 'variant_key', 'component_set_key', 'component_set_resolved', 'path', 'name', 'canvas_name', 'variant_name', 'text'],
    size: topK,
  });

  return resp.hits.hits.map(hit => ({
    score:                  hit._score,
    symbol_id:              hit._source.symbol_id,
    variant_key:            hit._source.variant_key,
    component_set_key:      hit._source.component_set_key,
    component_set_resolved: hit._source.component_set_resolved,
    path:                   hit._source.path,
    name:                   hit._source.name,
    canvas_name:            hit._source.canvas_name,
    variant_name:           hit._source.variant_name,
    _text:                  hit._source.text,
  }));
}

module.exports = { searchVariant };

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const query = process.argv[2];
  const topK  = Number(process.argv[3] || 5);

  if (!query) {
    console.error('用法: node vector_search.js "<查询>" [topK]');
    process.exit(1);
  }

  (async () => {
    console.log(`查询: "${query}"  topK=${topK}  ${MOCK_MODE ? '[MOCK]' : `[${EMBEDDING_MODEL}]`}\n`);
    const results = await searchVariant(query, topK);

    results.forEach((r, i) => {
      console.log(`#${i + 1}  score=${r.score?.toFixed(4)}`);
      console.log(`  名称:               ${r.name}  [${r.canvas_name}]`);
      console.log(`  变体:               ${r.variant_name || '(无变体)'}`);
      console.log(`  文本:               ${r._text}`);
      console.log(`  symbol_id:          ${r.symbol_id}`);
      console.log(`  variant_key:        ${r.variant_key}`);
      console.log(`  component_set_key:  ${r.component_set_key}`);
      console.log(`  path:               ${r.path}`);
      console.log();
    });
  })().catch(err => { console.error(err.message); process.exit(1); });
}
