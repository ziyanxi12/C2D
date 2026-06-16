#!/usr/bin/env node
'use strict';

/**
 * 构建变体向量索引，写入 Elasticsearch。
 *
 * 用法：
 *   node build_vector_index.js          # 真实 embedding API → 写 ES
 *   MOCK_EMBED=1 node build_vector_index.js  # mock 随机向量 → 写 ES（结构测试）
 *
 * ES 索引名由 ES_INDEX 环境变量控制（默认 component_variants）。
 * 已存在时先删除再重建（全量刷新），可改 REINDEX=1 跳过删除步骤（追加模式）。
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
const BATCH_SIZE         = 25;  // DashScope 单批上限

const COMPONENT_INDEX_PATH = process.env.COMPONENT_INDEX_PATH
  || path.resolve(__dirname, '../component_index.json');
const TRANS_PATH = path.resolve(__dirname, 'value_translations.json');
const ES_INDEX   = process.env.ES_INDEX || 'component_variants';
const REINDEX    = /^(1|true|yes)$/i.test(process.env.REINDEX || '');

// ── 翻译表 & 文本构建 ─────────────────────────────────────────────────────────

// key=value 首先匹配，否则匹配裸 value
const TRANSLATIONS = (() => {
  const raw = JSON.parse(fs.readFileSync(TRANS_PATH, 'utf8'));
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_comment')));
})();

// 搜索精度无关、不参与 embedding 的 key
const SKIP_KEYS = new Set([
  '命名', '名称', '_iconName', '_spacing', 'innerMargin', 'line', 'linePositon',
  '_layer', '_number', '_version', '_picture', '_color', 'itemCol', 'columns',
  'starCount', 'number', 'data', 'options', '类型',
]);

function translatePair(key, val) {
  // 1. 精确 key=value 命中
  const exact = TRANSLATIONS[`${key}=${val}`];
  if (exact) return `${val} ${exact}`;
  // 2. 只有 value 本身（通用词）
  const generic = TRANSLATIONS[val];
  if (generic) return `${val} ${generic}`;
  // 3. 无翻译：直接用原值（可能是英文组件名/数字等）
  return val;
}

function shouldSkipPair(key, val) {
  if (SKIP_KEYS.has(key)) return true;
  if (/^ic_|^img_/.test(val)) return true;   // 图标名
  if (/^\d+px$/.test(val)) return true;       // 像素值
  if (/_grid_/.test(val) || /^\d+-[A-Z]/.test(val)) return true; // 栅格规格
  if (val.length > 30) return true;           // 过长的唯一标识
  return false;
}

/**
 * 把变体名 "status=primary, Interaction=hover, size=large, disabled=true"
 * 转成精简 embedding 文本，只拼有意义的值和中文译词。
 */
function buildVariantTokens(variantName) {
  const tokens = [];
  for (const part of variantName.split(',')) {
    const t = part.trim();
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (shouldSkipPair(key, val)) continue;
    tokens.push(translatePair(key, val));
  }
  return tokens.join(' ');
}

/**
 * 最终 embedding 文本格式：
 *   {componentName} {canvasName} {variant tokens}
 * 示例：
 *   文字链接 基础类 inline 内联 hover 悬停 normal 标准 可用
 */
function buildEmbeddingText(entry, variant) {
  const name     = entry.name || '';
  const canvas   = (entry.canvasName || '').replace(/^\d+\./, '').trim(); // 去掉 "1." 前缀
  const tokens   = variant ? buildVariantTokens(variant.name) : '';
  return [name, canvas, tokens].filter(Boolean).join(' ');
}

// ── Embedding API ─────────────────────────────────────────────────────────────

const client = new OpenAI({
  apiKey:  process.env.DASHSCOPE_API_KEY,
  baseURL: EMBEDDING_BASE_URL,
  timeout: 60_000,
});

function mockEmbedding() {
  // 生成单位随机向量（归一化），结构与真实向量一致
  const v = Array.from({ length: EMBEDDING_DIM }, () => Math.random() * 2 - 1);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map(x => x / norm);
}

async function embedBatch(texts) {
  if (MOCK_MODE) {
    return texts.map(() => mockEmbedding());
  }
  const resp = await client.embeddings.create({
    model:           EMBEDDING_MODEL,
    input:           texts,
    dimensions:      EMBEDDING_DIM,
    encoding_format: 'float',
  });
  return resp.data.map(d => d.embedding);
}

// ── 构建记录列表 ──────────────────────────────────────────────────────────────

function buildRecords({ componentSets = [], standaloneComponents = [] }) {
  const records = [];

  for (const entry of componentSets) {
    const filePath   = entry.hexFile || '';
    const canvasName = entry.canvasName || '';
    const name       = entry.name || '';
    if (!entry.variants || entry.variants.length === 0) {
      records.push({
        text:                   buildEmbeddingText(entry, null),
        symbol_id:              entry.guid || entry.componentKey,
        variant_key:            entry.componentKey,
        component_set_key:      entry.componentKey,
        component_set_resolved: true,
        path:                   filePath,
        name,
        canvas_name:            canvasName,
        variant_name:           '',
      });
    } else {
      for (const variant of entry.variants) {
        records.push({
          text:                   buildEmbeddingText(entry, variant),
          symbol_id:              variant.guid,
          variant_key:            variant.variantKey,
          component_set_key:      entry.componentKey,
          component_set_resolved: true,
          path:                   filePath,
          name,
          canvas_name:            canvasName,
          variant_name:           variant.name || '',
        });
      }
    }
  }

  for (const entry of standaloneComponents) {
    records.push({
      text:                   buildEmbeddingText(entry, null),
      symbol_id:              entry.guid || entry.componentKey,
      variant_key:            entry.componentKey,
      component_set_key:      entry.componentKey,
      component_set_resolved: true,
      path:                   entry.hexFile || '',
      name:                   entry.name || '',
      canvas_name:            entry.canvasName || '',
      variant_name:           '',
    });
  }

  return records;
}

// ── ES 操作 ───────────────────────────────────────────────────────────────────

const ES_MAPPING = {
  mappings: {
    properties: {
      text:                   { type: 'text' },
      embedding:              { type: 'dense_vector', dims: EMBEDDING_DIM, index: true, similarity: 'cosine' },
      symbol_id:              { type: 'keyword' },
      variant_key:            { type: 'keyword' },
      component_set_key:      { type: 'keyword' },
      component_set_resolved: { type: 'boolean' },
      path:                   { type: 'keyword' },
      name:                   { type: 'keyword' },
      canvas_name:            { type: 'keyword' },
      variant_name:           { type: 'keyword' },
    },
  },
};

async function ensureIndex(es) {
  const exists = await es.indices.exists({ index: ES_INDEX });
  if (exists) {
    if (REINDEX) {
      console.log(`索引 ${ES_INDEX} 已存在，跳过删除（REINDEX=1 追加模式）`);
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

  const indexData = JSON.parse(fs.readFileSync(COMPONENT_INDEX_PATH, 'utf8'));
  const records = buildRecords(indexData);
  const setCount = (indexData.componentSets || []).length + (indexData.standaloneComponents || []).length;
  console.log(`共 ${records.length} 条记录（${setCount} 个组件/变体集）`);

  console.log('\n--- embedding 文本预览 ---');
  records.slice(0, 3).forEach((r, i) => console.log(`[${i}] ${r.text}`));
  console.log('...\n');

  await ensureIndex(es);

  // 分批 embed → 立即写 ES，不在内存里攒全量
  const ES_BULK   = 200; // 每次 bulk 写入条数
  const embedBuf  = [];  // 攒够 ES_BULK 条再写
  const totalBatches = Math.ceil(records.length / BATCH_SIZE);

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    process.stdout.write(`Embed 批次 ${Math.floor(i / BATCH_SIZE) + 1}/${totalBatches} ... `);
    const vecs = await embedBatch(batch.map(r => r.text));
    console.log('done');

    for (let j = 0; j < batch.length; j++) {
      embedBuf.push({ ...batch[j], embedding: vecs[j] });
    }

    // 攒够一批就写 ES
    if (embedBuf.length >= ES_BULK || i + BATCH_SIZE >= records.length) {
      await bulkIndex(es, embedBuf.splice(0));
      process.stdout.write(`  → ES 写入至 ${Math.min(i + BATCH_SIZE, records.length)} 条\n`);
    }

    if (!MOCK_MODE && i + BATCH_SIZE < records.length) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // 刷新索引，让数据立即可搜
  await es.indices.refresh({ index: ES_INDEX });
  const count = await es.count({ index: ES_INDEX });
  console.log(`\n完成！ES 索引 ${ES_INDEX} 共 ${count.count} 条文档`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
