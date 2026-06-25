'use strict';

// match_dsl.js 的向量版：逻辑与原文件完全一致，
// 仅将 match_variant / batch_match 的导入换成向量实现
const { matchVariantsTogether, matchVariants } = require('./match_variant_vector');
const createLogger = require('../logger');

const logger = createLogger({
  name: 'dsl-match-service',
  level: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR,
});

const MATCHABLE_LAYERTYPE = 'component';

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

function buildMatchResult(nodes, matches) {
  return nodes.map((n, i) => ({
    nid:       n.nid,
    layerType: n.layerType,
    layerName: n.layerName,
    match:     matches[i] || null,
  }));
}

// 整页统一匹配（推荐）：所有节点合并一次批量向量请求
async function matchDsl(nodeOrArray) {
  const nodes = collectNodes(nodeOrArray);
  logger.info('matchDsl（向量整页匹配）提取节点', { count: nodes.length });
  if (nodes.length === 0) return [];

  const queries = nodes.map(n => n.layerName);
  const matches = await matchVariantsTogether(queries);
  const hit     = matches.filter(Boolean).length;
  logger.info('matchDsl 完成', { total: nodes.length, hit });
  return buildMatchResult(nodes, matches);
}

// 逐节点独立匹配（对照/排查用）
async function matchDslSingle(nodeOrArray) {
  const nodes = collectNodes(nodeOrArray);
  logger.info('matchDslSingle（向量逐节点匹配）提取节点', { count: nodes.length });
  if (nodes.length === 0) return [];

  const queries = nodes.map(n => n.layerName);
  const matches = await matchVariants(queries);
  const hit     = matches.filter(m => m && !m.error).length;
  logger.info('matchDslSingle 完成', { total: nodes.length, hit });
  return buildMatchResult(nodes, matches);
}

module.exports = { matchDsl, matchDslSingle };
