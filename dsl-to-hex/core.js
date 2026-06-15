'use strict';

const fs   = require('fs');
const path = require('path');
const { convert, getWasm, setTableTemplate } = require('./converter');

async function init() {
  await getWasm();

  // 预加载表格模版（可选）：在 .env 中配置 TABLE_TEMPLATE_PATH
  // 相对路径以 dsl-to-hex/ 目录为基准解析
  const rawPath = process.env.TABLE_TEMPLATE_PATH;
  if (rawPath) {
    const tmplPath = path.isAbsolute(rawPath)
      ? rawPath
      : path.resolve(__dirname, rawPath);
    try {
      const content = fs.readFileSync(tmplPath, 'utf8');
      setTableTemplate(content);
    } catch (e) {
      console.warn(`[dsl-to-hex] 表格模版加载失败: ${tmplPath} — ${e.message}`);
    }
  }
}

function getStats() {
  return { wasmLoaded: true };
}

module.exports = { init, convert, getStats };