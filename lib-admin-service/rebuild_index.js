'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// 直接从各 source 的 component_index.json 读取 → 合并打标 → 拼 searchText
// → 写 search_index.json，一步到位（不产出中间态文件）。

const SOURCES_PATH = path.resolve(__dirname, 'sources.json');

function expandTilde(p) {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function getLibOutDir() {
  return expandTilde(process.env.LIB_OUT_DIR || path.join(os.homedir(), 'lib'));
}

function loadSources() {
  if (!fs.existsSync(SOURCES_PATH)) return [];
  const { sources } = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
  return Array.isArray(sources) ? sources : [];
}

function saveSources(sources) {
  fs.writeFileSync(SOURCES_PATH, JSON.stringify({ sources }, null, 2), 'utf8');
}

function buildSearchText(entry) {
  const parts = [entry.name, entry.sourceLabel || ''];
  for (const v of entry.variants || []) {
    parts.push(v.name);
    // "缩放轴=折线图,状态=默认" → 拆出 "缩放轴" "折线图" "状态" "默认"
    parts.push(...v.name.split(/[=,]/));
  }
  return parts.join(' ');
}

// rebuildIndex(libOutDir) → { entries, sources: [{ key, label, componentSets, standaloneComponents, skipped }] }
// 读取 sources.json 中登记的每个 source 的 component_index.json，合并打标后
// 直接写出最终的 search_index.json（含 searchText 检索字段）
function rebuildIndex(libOutDir) {
  const actualLibOutDir = libOutDir || getLibOutDir();
  const searchIndexPath = path.join(actualLibOutDir, 'search_index.json');
  
  const sources = loadSources();
  const merged  = { componentSets: [], standaloneComponents: [] };
  const report  = [];

  for (const { key, label } of sources) {
    const indexPath = path.join(actualLibOutDir, key, 'component', 'component_index.json');
    if (!fs.existsSync(indexPath)) {
      report.push({ key, label, skipped: true, reason: `not found: ${indexPath}` });
      continue;
    }
    const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const componentSets        = data.componentSets || [];
    const standaloneComponents = data.standaloneComponents || [];

    for (const cs of componentSets) merged.componentSets.push({ ...cs, source: key, sourceLabel: label });
    for (const sc of standaloneComponents) merged.standaloneComponents.push({ ...sc, source: key, sourceLabel: label });

    report.push({ key, label, componentSets: componentSets.length, standaloneComponents: standaloneComponents.length });
  }

  const entries = [
    ...merged.componentSets.map(e => ({ ...e, _type: 'set' })),
    ...merged.standaloneComponents.map(e => ({ ...e, _type: 'standalone' })),
  ].map(e => ({ ...e, searchText: buildSearchText(e) }));

  fs.writeFileSync(searchIndexPath, JSON.stringify({ entries }, null, 2), 'utf8');

  return { entries: entries.length, sources: report };
}

module.exports = { loadSources, saveSources, rebuildIndex, SOURCES_PATH, getLibOutDir };
