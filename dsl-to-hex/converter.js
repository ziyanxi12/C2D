'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const createLogger = require('../logger');

const envFile = path.resolve(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k && v && !process.env[k.trim()]) process.env[k.trim()] = v.trim();
  });
}

const logger = createLogger({
  name: 'dsl-to-hex',
  level: process.env.LOG_LEVEL || 'debug',
  logDir: process.env.LOG_DIR
});

// 组件库 hex 根目录：与 component-service 的 LIB_OUT_DIR 指向同一份数据。
// DSL 中 instance.path 是相对此目录的路径（如 "h-design-chart/component/93_55829.txt"），
// 拼接后直接读本地文件，无需再请求 component-service 的 /hex/:key 接口。
const HEX_LIB_DIR = process.env.HEX_LIB_DIR
  || path.resolve(__dirname, '../../pixso-parse/pix-split/lib-out');

// ---------------------------------------------------------------------------
// 表格模版缓存（由 core.init() 通过 setTableTemplate 设置）
// convert() 调用时若未显式传入 tableTemplate，则使用此缓存值。
// ---------------------------------------------------------------------------
let _tableTemplate = '';

function setTableTemplate(content) {
  _tableTemplate = content || '';
  logger.info('表格模版已缓存', { bytes: _tableTemplate.length });
}

// ---------------------------------------------------------------------------
// WASM 单例（服务生命周期内只初始化一次）
// ---------------------------------------------------------------------------
let _wasmMod = null;

async function getWasm() {
  if (_wasmMod) return _wasmMod;

  const wasmJs = process.env.WASM_PATH
    || path.join(__dirname, 'bin/dsl_to_hex.js');

  if (!fs.existsSync(wasmJs)) {
    throw new Error(`WASM 文件不存在: ${wasmJs}\n请设置环境变量 WASM_PATH`);
  }

  const DslToHex = require(wasmJs);
  _wasmMod = await DslToHex();
  return _wasmMod;
}

// ---------------------------------------------------------------------------
// 遍历 DSL 图层树，收集所有不重复的 { component_set_key, path } 引用
// path 为相对 HEX_LIB_DIR 的 hex 文件路径（如 "h-design-chart/component/93_55829.txt"），
// 由 component-service 匹配结果中的 path 字段（= source + '/' + hexFile）直接写入 DSL
// ---------------------------------------------------------------------------
function collectHexRefs(layer, out) {
  if (layer.type === 'instance') {
    const inst = layer.instance;
    const key = inst && inst.component_set_key;
    if (key && !out.has(key)) out.set(key, inst.path || null);
    return; // instance 不含 children
  }
  for (const child of layer.children || []) {
    collectHexRefs(child, out);
  }
}

function extractHexRefs(dsl) {
  const refs = new Map(); // key → path
  for (const page of dsl.pages || []) {
    for (const layer of page.layers || []) {
      collectHexRefs(layer, refs);
    }
  }
  return [...refs.entries()].map(([key, relPath]) => ({ key, path: relPath }));
}

// ---------------------------------------------------------------------------
// 遍历 DSL 图层树，收集 svg/image 类型的 placeholder
// ---------------------------------------------------------------------------
function collectPlaceholders(layer, out) {
  const p = layer.placeholder;
  if (p && p.is_placeholder && p.note) {
    const type = p.replacement_type;
    if (type === 'svg' || type === 'image') {
      out.push({ id: layer.id, type, note: p.note });
    }
  }
  for (const child of layer.children || []) {
    collectPlaceholders(child, out);
  }
}

function extractPlaceholders(dsl) {
  const list = [];
  for (const page of dsl.pages || []) {
    for (const layer of page.layers || []) {
      collectPlaceholders(layer, list);
    }
  }
  return list;
}

function idToGuid(id) {
  return String(id).replace(/:/g, '_');
}

// ---------------------------------------------------------------------------
// 按 path 字段直接拼本地路径，读取所有组件的 hex 内容
// ---------------------------------------------------------------------------
async function readAllHex(refs) {
  const hexMap      = {};
  const missingKeys = [];

  logger.debug('开始读取 hex 文件', { total: refs.length });

  for (const { key, path: relPath } of refs) {
    if (!relPath) {
      missingKeys.push(key);
      logger.warn('组件缺少 path 字段，无法定位 hex 文件', { key });
      continue;
    }
    const filePath = path.join(HEX_LIB_DIR, relPath);
    try {
      hexMap[key] = await fs.promises.readFile(filePath, 'utf8');
    } catch (err) {
      missingKeys.push(key);
      logger.warn('组件 hex 读取失败', { filePath, error: err.message, stack: err.stack });
    }
  }

  logger.debug('读取 hex 文件完成', { success: Object.keys(hexMap).length, missing: missingKeys.length });
  return { hexMap, missingKeys };
}

// ---------------------------------------------------------------------------
// 将 hex 输出与 svg/png 资源打包成 zip，返回 Buffer
// ---------------------------------------------------------------------------
function buildZip(tmpDir, hexContent, placeholders) {
  fs.writeFileSync(path.join(tmpDir, 'output.txt'), hexContent, 'utf8');

  const files = ['output.txt'];
  
  for (const { id, type } of placeholders) {
    const guid = idToGuid(id);
    const fname = type === 'svg' ? `${guid}.svg` : `${guid}.png`;
    if (fs.existsSync(path.join(tmpDir, fname))) files.push(fname);
  }

  const zipPath = path.join(tmpDir, 'output.zip');
  const r = spawnSync('zip', [zipPath, ...files], { cwd: tmpDir });
  if (r.status !== 0) {
    throw new Error(`zip 打包失败: ${r.stderr?.toString().trim()}`);
  }

  logger.debug('打包 zip 完成', { filesCount: files.length, files });
  return { zipBuf: fs.readFileSync(zipPath), filesCount: files.length };
}

// ---------------------------------------------------------------------------
// 解析 WASM dslToHex 的返回值
// WASM 返回三种格式：
//   1. '{"error":"..."}' — 转换失败
//   2. '{"hex":"...","missing":["key",...]}' — 成功但有缺失组件
//   3. '<!-- pixso binary data -->\n{hex}' — 完全成功
// ---------------------------------------------------------------------------
function parseWasmResult(raw) {
  if (raw.startsWith('{"error"')) {
    return JSON.parse(raw); // { error: "..." }
  }
  if (raw.startsWith('{"hex"')) {
    const r = JSON.parse(raw);
    // WASM 在 JSON 中对换行和引号做了转义，这里还原
    const hex = r.hex.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    return { hex, missing_keys: r.missing || [] };
  }
  return { hex: raw };
}

// ---------------------------------------------------------------------------
// 主转换函数
// ---------------------------------------------------------------------------
async function convert(dsl, tableTemplateContent) {
  // 未显式传入时，使用模块级缓存（由 TABLE_TEMPLATE_PATH 在 init 阶段预加载）
  if (tableTemplateContent === undefined) tableTemplateContent = _tableTemplate;
  logger.info('开始转换', { pages: dsl.pages?.length || 0 });

  // 1. 提取所有 { component_set_key, path } 引用
  const refs = extractHexRefs(dsl);
  logger.debug('提取组件引用完成', { refsCount: refs.length, keys: refs.map(r => r.key) });

  // 2. 按 path 拼本地路径，直接读取 hex 内容
  const { hexMap, missingKeys: fetchMissing } = await readAllHex(refs);
  logger.debug('读取 hex 文件完成', { successCount: Object.keys(hexMap).length, missingCount: fetchMissing.length });

  // 3. 写临时目录
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pix-'));
  try {
    // hex 文件：{tmpDir}/{key}.txt（WASM 按此格式查找）
    for (const [key, content] of Object.entries(hexMap)) {
      fs.writeFileSync(path.join(tmpDir, `${key}.txt`), content, 'utf8');
    }
    if (Object.keys(hexMap).length > 0) {
      logger.debug('写入 hex 文件完成', { count: Object.keys(hexMap).length });
    }

    // placeholder svg/image 文件：{tmpDir}/{guid}.svg 或 {guid}.png
    const placeholders = extractPlaceholders(dsl);
    let svgCount = 0, pngCount = 0;
    for (const { id, type, note } of placeholders) {
      const guid = idToGuid(id);
      if (type === 'svg') {
        fs.writeFileSync(path.join(tmpDir, `${guid}.svg`), note, 'utf8');
        svgCount++;
      } else {
        // base64 → binary
        const b64 = note.replace(/^data:image\/[^;]+;base64,/, '');
        fs.writeFileSync(path.join(tmpDir, `${guid}.png`), Buffer.from(b64, 'base64'));
        pngCount++;
      }
    }
    if (placeholders.length > 0) {
      logger.debug('写入 placeholder 文件完成', { svg: svgCount, png: pngCount, total: placeholders.length });
    }

    // DSL JSON 临时文件
    const dslPath = path.join(tmpDir, 'dsl.json');
    fs.writeFileSync(dslPath, JSON.stringify(dsl), 'utf8');

    // 表格模板（可选）：写入临时目录后传路径给 WASM
    let tableTemplatePath = '';
    if (tableTemplateContent) {
      tableTemplatePath = path.join(tmpDir, 'table_template.txt');
      fs.writeFileSync(tableTemplatePath, tableTemplateContent, 'utf8');
      logger.debug('写入表格模板完成');
    }

    // 4. 调用 WASM（同步，阻塞事件循环，单线程自然串行）
    logger.debug('调用 WASM 转换');
    const mod = await getWasm();
    const raw = mod.dslToHex(dslPath, tmpDir, tableTemplatePath);
    logger.debug('WASM 转换完成', { resultType: raw.startsWith('{"error"') ? 'error' : raw.startsWith('{"hex"') ? 'hex_with_missing' : 'hex' });

    // 5. 解析结果
    const result = parseWasmResult(raw);
    if (result.error) {
      logger.error('WASM 转换失败', { error: result.error });
      return result;
    }

    // 6. 打包 zip
    const { zipBuf, filesCount } = buildZip(tmpDir, result.hex, placeholders);

    // 合并 fetch 阶段的 missing 与 WASM 报告的 missing
    const allMissing = [...fetchMissing, ...(result.missing_keys || [])];
    const out = { zip: zipBuf.toString('base64') };
    if (allMissing.length > 0) out.missing_keys = [...new Set(allMissing)];

    logger.info('转换完成', { zipFiles: filesCount, hexFiles: Object.keys(hexMap).length, svgFiles: svgCount, pngFiles: pngCount, missingKeys: allMissing.length });
    return out;
  } finally {
    // 8. 无论成功失败都清理临时目录
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { convert, getWasm, setTableTemplate, HEX_LIB_DIR };
