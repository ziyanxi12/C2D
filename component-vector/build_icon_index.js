#!/usr/bin/env node
'use strict';

/**
 * 构建图标向量索引，写入 Elasticsearch。
 *
 * 用法：
 *   node build_icon_index.js          # 真实 embedding API
 *   MOCK_EMBED=1 node build_icon_index.js  # mock 随机向量
 */

const fs     = require('fs');
const path   = require('path');
const OpenAI = require('openai');
const { getClient } = require('./es_client');

// ── 环境配置 ─────────────────────────────────────────────────────────────────

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
const BATCH_SIZE         = 25;

const ICONS_PATH = process.env.ICONS_PATH || path.resolve(__dirname, 'icons.json');
const ES_INDEX   = process.env.ICON_ES_INDEX || 'component_icons';
const REINDEX    = /^(1|true|yes)$/i.test(process.env.REINDEX || '');

// ── Embedding 文本构建 ────────────────────────────────────────────────────────

// 判断是否为自然语言（含中文或空格）
function isNaturalLanguage(str) {
  return /[一-鿿，。、\s]/.test(str);
}

// 将标识符风格的字符串拆成可读词组
// "ic_it_terminology_qa" → "it terminology qa"
// "terminologyQA"        → "terminology QA"
function splitIdentifier(str) {
  return str
    .replace(/^ic_/, '')                        // 去掉 ic_ 前缀
    .replace(/([a-z])([A-Z])/g, '$1 $2')        // camelCase 拆词
    .replace(/_/g, ' ')                          // 下划线转空格
    .trim();
}

function buildIconText(icon) {
  const parts = [icon.name];

  if (icon.englishName) {
    parts.push(
      isNaturalLanguage(icon.englishName)
        ? icon.englishName
        : splitIdentifier(icon.englishName)
    );
  }

  if (icon.description) {
    parts.push(
      isNaturalLanguage(icon.description)
        ? icon.description
        : splitIdentifier(icon.description)
    );
  }

  return parts.filter(Boolean).join(' ');
}

// ── Embedding ─────────────────────────────────────────────────────────────────

const client = new OpenAI({
  apiKey:  process.env.DASHSCOPE_API_KEY,
  baseURL: EMBEDDING_BASE_URL,
  timeout: 60_000,
});

function mockEmbedding() {
  const v = Array.from({ length: EMBEDDING_DIM }, () => Math.random() * 2 - 1);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map(x => x / norm);
}

async function embedBatch(texts) {
  if (MOCK_MODE) return texts.map(() => mockEmbedding());
  const resp = await client.embeddings.create({
    model:           EMBEDDING_MODEL,
    input:           texts,
    dimensions:      EMBEDDING_DIM,
    encoding_format: 'float',
  });
  return resp.data.map(d => d.embedding);
}

// ── ES 操作 ───────────────────────────────────────────────────────────────────

const ES_MAPPING = {
  mappings: {
    properties: {
      text:        { type: 'text' },
      embedding:   { type: 'dense_vector', dims: EMBEDDING_DIM, index: true, similarity: 'cosine' },
      icon_id:      { type: 'keyword' },
      name:         { type: 'keyword' },
      english_name: { type: 'keyword' },
      description:  { type: 'text' },
    },
  },
};

async function ensureIndex(es) {
  const exists = await es.indices.exists({ index: ES_INDEX });
  if (exists) {
    if (REINDEX) {
      console.log(`索引 ${ES_INDEX} 已存在，追加模式`);
      return;
    }
    console.log(`删除旧索引 ${ES_INDEX} ...`);
    await es.indices.delete({ index: ES_INDEX });
  }
  console.log(`创建索引 ${ES_INDEX} ...`);
  await es.indices.create({ index: ES_INDEX, ...ES_MAPPING });
}

async function bulkIndex(es, docs) {
  const body = docs.flatMap(doc => [
    { index: { _index: ES_INDEX } },
    doc,
  ]);
  const resp = await es.bulk({ body, refresh: false });
  if (resp.errors) {
    const failed = resp.items.filter(i => i.index?.error);
    console.warn(`  ⚠ 本批有 ${failed.length} 条写入失败`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(MOCK_MODE ? '[MOCK 模式] 使用随机向量' : `[真实模式] ${EMBEDDING_BASE_URL} / ${EMBEDDING_MODEL}`);

  const es = getClient();
  await es.ping().catch(() => { throw new Error(`无法连接 ES：${process.env.ES_URL || 'http://localhost:9200'}`); });
  console.log('ES 连接正常');

  const icons = JSON.parse(fs.readFileSync(ICONS_PATH, 'utf8'));
  console.log(`共 ${icons.length} 个图标`);

  // 预览
  console.log('\n--- embedding 文本预览 ---');
  icons.slice(0, 3).forEach((icon, i) => {
    console.log(`[${i}] ${buildIconText(icon).slice(0, 100)}`);
  });
  console.log('...\n');

  await ensureIndex(es);

  const ES_BULK      = 200;
  const embedBuf     = [];
  const totalBatches = Math.ceil(icons.length / BATCH_SIZE);

  for (let i = 0; i < icons.length; i += BATCH_SIZE) {
    const batch = icons.slice(i, i + BATCH_SIZE);
    process.stdout.write(`Embed 批次 ${Math.floor(i / BATCH_SIZE) + 1}/${totalBatches} ... `);

    const texts = batch.map(icon => buildIconText(icon));
    const vecs  = await embedBatch(texts);
    console.log('done');

    for (let j = 0; j < batch.length; j++) {
      const icon = batch[j];
      embedBuf.push({
        text:         buildIconText(icon),
        embedding:    vecs[j],
        icon_id:      icon.id,
        name:         icon.name,
        english_name: icon.englishName || '',
        description:  icon.description || '',
      });
    }

    if (embedBuf.length >= ES_BULK || i + BATCH_SIZE >= icons.length) {
      await bulkIndex(es, embedBuf.splice(0));
      process.stdout.write(`  → ES 写入至 ${Math.min(i + BATCH_SIZE, icons.length)} 条\n`);
    }

    if (!MOCK_MODE && i + BATCH_SIZE < icons.length) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  await es.indices.refresh({ index: ES_INDEX });
  const count = await es.count({ index: ES_INDEX });
  console.log(`\n完成！ES 索引 ${ES_INDEX} 共 ${count.count} 条文档`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
