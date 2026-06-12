#!/usr/bin/env node
'use strict';

const { matchVariantsTogether } = require('./match_variant');
const { matchVariants }         = require('./batch_match');
const createLogger              = require('../logger');

const logger = createLogger({
  name: 'dsl-match-service',
  level: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR
});

// 只匹配 layerType 为 component 的节点
const MATCHABLE_LAYERTYPE = 'component';

// 递归收集所有需要匹配的节点（layerType === 'component'）
function collectNodes(nodeOrArray, result = []) {
  if (Array.isArray(nodeOrArray)) {
    nodeOrArray.forEach(n => collectNodes(n, result));
    return result;
  }
  const node = nodeOrArray;
  if (!node || typeof node !== 'object') return result;

  if (node.layerType === MATCHABLE_LAYERTYPE) {
    result.push({ nid: node.nid, layerType: node.layerType, layerName: node.layerName });
  }
  if (Array.isArray(node.children)) {
    node.children.forEach(child => collectNodes(child, result));
  }
  return result;
}

// 直接用 layerName 作为查询词
function buildQuery(layerName) {
  return layerName;
}

function buildMatchResult(nodes, matches) {
  const result = nodes.map((n, i) => ({
    nid:        n.nid,
    layerType:  n.layerType,
    layerName:  n.layerName,
    match:      matches[i] || null,
  }));
  logger.debug('buildMatchResult 结果', { count: result.length, matched: result.filter(r => r.match).length, result });
  return result;
}

// 整页统一匹配：本页所有 layerType=component 节点合并成一次 LLM 裁决（见 matchVariantsTogether），
// 让模型看到全局上下文后统一选择，避免同名组件的多个实例
// 被分别选到不一致的组件集/变体——/match-dsl 走这个
async function matchDsl(nodeOrArray) {
  const nodes = collectNodes(nodeOrArray);
  console.log(`[match_dsl] matchDsl（整页统一匹配）→ 提取到 ${nodes.length} 个 layerType=component 节点`);
  if (nodes.length === 0) {
    console.log(`[match_dsl] matchDsl ✓ 完成：0 个节点中命中 0 个`);
    return [];
  }

  const queries = nodes.map(n => buildQuery(n.layerName));
  console.log(`[match_dsl] matchDsl → 查询词：${JSON.stringify(queries)}`);
  const matches = await matchVariantsTogether(queries);
  const hit = matches.filter(Boolean).length;
  console.log(`[match_dsl] matchDsl ✓ 完成：${nodes.length} 个节点中命中 ${hit} 个`);
  return buildMatchResult(nodes, matches);
}

// 逐节点独立匹配：每个 layerType=component 节点各自跑一遍完整的三步流程（语义提取→选组件集→选变体），
// 互不知情，可能导致同名组件的多个实例被分别选到不一致的结果——保留给
// /match-dsl-single，供需要对照旧行为或排查问题时使用
async function matchDslSingle(nodeOrArray) {
  const nodes = collectNodes(nodeOrArray);
  console.log(`[match_dsl] matchDslSingle（逐节点独立匹配）→ 提取到 ${nodes.length} 个 layerType=component 节点`);
  if (nodes.length === 0) {
    console.log(`[match_dsl] matchDslSingle ✓ 完成：0 个节点中命中 0 个`);
    return [];
  }

  const queries = nodes.map(n => buildQuery(n.layerName));
  console.log(`[match_dsl] matchDslSingle → 查询词：${JSON.stringify(queries)}`);
  const matches = await matchVariants(queries);
  const hit = matches.filter(m => m && !m.error).length;
  console.log(`[match_dsl] matchDslSingle ✓ 完成：${nodes.length} 个节点中命中 ${hit} 个`);
  return buildMatchResult(nodes, matches);
}

// 跨平台读取 stdin：/dev/stdin 是 Unix 专属特殊文件，Windows 上不存在
// （会抛 ENOENT），用 process.stdin 流读取在三大平台上行为一致
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// CLI：node match_dsl.js < node.json
if (require.main === module) {
  readStdin()
    .then(raw => matchDsl(JSON.parse(raw)))
    .then(r => {
      logger.info('CLI matchDsl 完成', { results: r.length });
    })
    .catch(err => {
      logger.error('CLI 错误', { error: err.message, stack: err.stack });
      process.exit(1);
    });
}

module.exports = { matchDsl, matchDslSingle };
