'use strict';

const fs   = require('fs');
const path = require('path');
const { searchComponent, searchComponentBatch } = require('./vector_client');
const createLogger = require('../logger');

const logger = createLogger({
  name: 'dsl-match-service',
  level: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR,
});

// 独立的缓存文件，不与 LLM 版的 canonical_map.json 混用
// 存储格式：{ [canonicalKey]: matchResult }，无 indexFingerprint（向量库更新后手动调 clearIndexCache）
const CANONICAL_MAP_PATH = path.resolve(__dirname, 'canonical_map_vector.json');

let _canonicalMap = null;
let _mapWriteLock = Promise.resolve();

function canonicalKey(query) {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function loadCanonicalMap() {
  if (_canonicalMap) return _canonicalMap;
  if (fs.existsSync(CANONICAL_MAP_PATH)) {
    try {
      _canonicalMap = JSON.parse(fs.readFileSync(CANONICAL_MAP_PATH, 'utf8'));
      return _canonicalMap;
    } catch {}
  }
  _canonicalMap = {};
  return _canonicalMap;
}

// 串行写入，避免并发覆写（merge-on-write：写前重读再合并）
function updateCanonicalMap(entries) {
  _mapWriteLock = _mapWriteLock.then(() => {
    let current = {};
    if (fs.existsSync(CANONICAL_MAP_PATH)) {
      try { current = JSON.parse(fs.readFileSync(CANONICAL_MAP_PATH, 'utf8')); } catch {}
    }
    for (const { key, result } of entries) {
      current[key] = result;
    }
    fs.writeFileSync(CANONICAL_MAP_PATH, JSON.stringify(current, null, 2), 'utf8');
    _canonicalMap = current;
    logger.info('向量规范映射表写入完成', { newEntries: entries.length, total: Object.keys(current).length });
  }).catch(err => logger.error('向量规范映射表写入失败', { error: err.message }));
  return _mapWriteLock;
}

// 向量库数据更新后调用（对应 server.js 里 rebuild-index 后的 clearIndexCache 调用）
function clearIndexCache() {
  _canonicalMap = null;
  logger.info('向量规范映射表缓存已清除');
}

// 将向量服务返回的单条命中映射为 match 结果结构
function toMatchResult(hit) {
  if (!hit) return null;
  return {
    source:           hit.domain,
    sourceLabel:      hit.domain,
    componentSetName: hit.canvas_name,
    componentKey:     hit.component_set_key,
    hexFile:          hit.path,
    path:             hit.path,
    variant: {
      name:       hit.variant_name,
      variantKey: hit.variant_key,
      guid:       hit.variant_key,
    },
    score:  hit.score,
    reason: '',
  };
}

// ── 单条匹配 ──────────────────────────────────────────────────────────────────

async function matchVariant(description) {
  const canonicalMap = loadCanonicalMap();
  const cKey = canonicalKey(description);

  if (canonicalMap[cKey]) {
    logger.info('matchVariant 缓存命中', { description });
    return canonicalMap[cKey];
  }

  logger.info('matchVariant 调用向量服务', { description });
  const hits = await searchComponent(description);

  if (!hits || hits.length === 0) {
    logger.warn('matchVariant 无结果', { description });
    return null;
  }

  const result = toMatchResult(hits[0]);
  logger.info('matchVariant 命中', {
    description,
    componentSetName: result.componentSetName,
    variantName:      result.variant?.name,
    score:            result.score,
  });

  await updateCanonicalMap([{ key: cKey, result }]);
  return result;
}

// ── 批量匹配（供 /batch 接口使用）────────────────────────────────────────────
// 内部按 canonicalKey 去重，缓存未命中的统一走批量向量 API

async function matchVariants(descriptions) {
  if (descriptions.length === 0) return [];

  const canonicalMap = loadCanonicalMap();
  const results      = new Array(descriptions.length).fill(null);

  // 按 canonicalKey 聚类：相同描述只查一次
  const keyToCluster = new Map();
  descriptions.forEach((desc, i) => {
    const key = canonicalKey(desc);
    if (!keyToCluster.has(key)) keyToCluster.set(key, { desc, indices: [] });
    keyToCluster.get(key).indices.push(i);
  });

  const pending = [];
  for (const [key, cluster] of keyToCluster) {
    if (canonicalMap[key]) {
      cluster.indices.forEach(i => { results[i] = canonicalMap[key]; });
    } else {
      pending.push({ key, ...cluster });
    }
  }

  if (pending.length === 0) return results;

  logger.info('matchVariants 批量向量搜索', { count: pending.length });
  const batchHits    = await searchComponentBatch(pending.map(p => p.desc));
  const newMapEntries = [];

  pending.forEach(({ key, desc, indices }, j) => {
    const hits   = batchHits[j];
    const result = toMatchResult(hits && hits.length > 0 ? hits[0] : null);
    indices.forEach(i => { results[i] = result; });
    if (result) {
      newMapEntries.push({ key, result });
    } else {
      logger.warn('matchVariants 无结果', { desc });
    }
  });

  if (newMapEntries.length > 0) await updateCanonicalMap(newMapEntries);
  return results;
}

// ── 整页统一匹配（供 /match-dsl 接口使用）────────────────────────────────────
// 向量搜索是确定性的，相同 query 永远返回相同结果，无需 LLM 对齐基准（anchorNote）

async function matchVariantsTogether(queries) {
  if (queries.length === 0) return [];

  const canonicalMap = loadCanonicalMap();
  logger.info('matchVariantsTogether 开始', { queries: queries.length });

  // Step 1: 按 canonicalKey 聚类
  const clusterMap = new Map();
  queries.forEach((query, i) => {
    const key = canonicalKey(query);
    if (!clusterMap.has(key)) clusterMap.set(key, { representativeQuery: query, indices: [] });
    clusterMap.get(key).indices.push(i);
  });

  // Step 2: 缓存命中
  const resultByIndex = new Map();
  const pending       = [];

  for (const [key, cluster] of clusterMap) {
    if (canonicalMap[key]) {
      logger.info('规范映射表命中', { key, instances: cluster.indices.length });
      cluster.indices.forEach(i => resultByIndex.set(i, canonicalMap[key]));
    } else {
      pending.push({ key, ...cluster });
    }
  }
  logger.info('缓存状态', { hit: clusterMap.size - pending.length, pending: pending.length });

  if (pending.length === 0) {
    return queries.map((_, i) => resultByIndex.get(i) || null);
  }

  // Step 3: 批量向量搜索
  logger.info('批量向量搜索', { count: pending.length });
  const batchHits    = await searchComponentBatch(pending.map(c => c.representativeQuery));
  const newMapEntries = [];

  pending.forEach((cluster, j) => {
    const hits   = batchHits[j];
    const result = toMatchResult(hits && hits.length > 0 ? hits[0] : null);
    cluster.indices.forEach(i => resultByIndex.set(i, result));
    if (result) {
      newMapEntries.push({ key: cluster.key, result });
      logger.info('向量命中', {
        query:            cluster.representativeQuery,
        componentSetName: result.componentSetName,
        variantName:      result.variant?.name,
        score:            result.score,
      });
    } else {
      logger.warn('向量无结果', { query: cluster.representativeQuery });
    }
  });

  if (newMapEntries.length > 0) await updateCanonicalMap(newMapEntries);

  const final = queries.map((_, i) => resultByIndex.get(i) || null);
  logger.info('matchVariantsTogether 完成', { matched: final.filter(Boolean).length, total: queries.length });
  return final;
}

module.exports = { matchVariant, matchVariants, matchVariantsTogether, clearIndexCache };
