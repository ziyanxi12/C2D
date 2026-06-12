#!/usr/bin/env node
'use strict';

const fs                = require('fs');
const path              = require('path');
const os                = require('os');
const express           = require('express');
const multer            = require('multer');
const { splitLibrary }   = require('./split_lib');
const { loadSources, saveSources, rebuildIndex } = require('./rebuild_index');
const createLogger      = require('../logger');

const envFile = path.resolve(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [k, v] = trimmed.split('=');
    if (k && v && !process.env[k.trim()]) process.env[k.trim()] = v.trim();
  });
}

const app    = express();
const PORT   = Number(process.env.PORT) || 3103;
const upload = multer({ storage: multer.memoryStorage() });
const logger = createLogger({
  name: 'lib-admin-service',
  level: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR
});

function expandTilde(p) {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

const LIB_OUT_DIR = expandTilde(process.env.LIB_OUT_DIR || path.join(os.homedir(), 'lib'));

app.use(express.json());

function sendError(res, label, status, payload, extra) {
  const message = (payload && typeof payload === 'object' && 'error' in payload)
    ? payload.error
    : JSON.stringify(payload);
  const extraStr = extra ? ` (${extra})` : '';
  if (status >= 500) {
    logger.error(`${label}${extraStr} 返回 ${status}`, { message });
  } else {
    logger.warn(`${label}${extraStr} 返回 ${status}`, { message });
  }
  return res.status(status).json(payload);
}

const SEARCH_INDEX_PATH = path.join(LIB_OUT_DIR, 'search_index.json');
const hexPathMap = new Map();

function buildHexPathMap() {
  if (!fs.existsSync(SEARCH_INDEX_PATH)) {
    logger.info('hex 索引文件不存在，跳过加载', { path: SEARCH_INDEX_PATH });
    return 0;
  }
  const { entries } = JSON.parse(fs.readFileSync(SEARCH_INDEX_PATH, 'utf8'));
  hexPathMap.clear();
  for (const entry of entries) {
    if (!entry.hexFile || !entry.source) continue;
    const key = path.basename(entry.hexFile, path.extname(entry.hexFile));
    hexPathMap.set(key, path.join(LIB_OUT_DIR, entry.source, entry.hexFile));
  }
  return hexPathMap.size;
}

const loadedCount = buildHexPathMap();
logger.info('hex 索引加载成功', { count: loadedCount, source: SEARCH_INDEX_PATH });

const KEY_RE = /^([a-f0-9]{40}|\d+_\d+)$/;
const SOURCE_DIR_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', hex_keys: hexPathMap.size });
});

app.get('/sources', (req, res) => {
  res.json({ sources: loadSources() });
});

app.post('/sources', (req, res) => {
  const key   = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
  logger.info('POST /sources 收到请求', { key, label });

  if (!key || !SOURCE_DIR_RE.test(key)) {
    return sendError(res, 'POST /sources', 400, { error: 'key must be a simple directory name (letters/digits/-/_, no path separators), matching the lib-out/ subdirectory' }, `key="${key}"`);
  }
  if (!label) {
    return sendError(res, 'POST /sources', 400, { error: 'label is required' }, `key="${key}"`);
  }

  const sources = loadSources();
  if (sources.some(s => s.key === key)) {
    return sendError(res, 'POST /sources', 409, { error: `source already registered: ${key}` });
  }

  sources.push({ key, label });
  saveSources(sources);
  res.json({ sources });
});

app.post('/rebuild-index', (req, res) => {
  logger.info('POST /rebuild-index 收到请求');
  try {
    logger.info('开始读取 sources.json 并重新生成 search_index.json');
    const result = rebuildIndex(LIB_OUT_DIR);
    logger.info('索引已重写，开始重建 hexPathMap', { entries: result.entries });
    const hexKeys = buildHexPathMap();
    logger.info('rebuild-index 完成', { hex_keys: hexKeys });
    res.json({ ...result, hex_keys: hexKeys });
  } catch (err) {
    sendError(res, 'POST /rebuild-index', 500, { error: err.message });
  }
});

const SPLIT_UPLOAD_LIMIT = 200 * 1024 * 1024;
const splitUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: SPLIT_UPLOAD_LIMIT } });

app.post('/split', splitUpload.single('file'), async (req, res) => {
  if (!req.file) {
    logger.info('POST /split 收到请求');
    return sendError(res, 'POST /split', 400, { error: 'send a .pix file via -F "file=@library.pix"' });
  }

  const publishFile = typeof req.body?.publishFile === 'string' ? req.body.publishFile.trim() : '';
  const source      = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
  logger.info('POST /split 收到请求', { 
    file: req.file.originalname, 
    size: req.file.size,
    source: source || '(未指定，返回 zip)'
  });

  if (source && !SOURCE_DIR_RE.test(source)) {
    return sendError(res, 'POST /split', 400, { error: 'source must be a simple directory name (letters/digits/-/_, no path separators)' }, `source="${source}"`);
  }

  try {
    const opts = { originalName: req.file.originalname, publishFile };
    if (source) {
      opts.source  = source;
      opts.saveDir = path.join(LIB_OUT_DIR, source);
    }

    logger.info('调用 split_compset WASM 拆解', { file: req.file.originalname });
    const result = await splitLibrary(req.file.buffer, opts);
    if (result.error) return sendError(res, 'POST /split', 500, { error: result.error }, req.file.originalname);
    logger.info('split 完成', { stats: result.stats || result });
    res.json(result);
  } catch (err) {
    sendError(res, 'POST /split', 500, { error: err.message }, req.file.originalname);
  }
});

app.get('/hex/:key', (req, res) => {
  const { key } = req.params;
  logger.info('GET /hex/:key 收到请求', { key });

  if (!KEY_RE.test(key)) {
    return sendError(res, 'GET /hex/:key', 400, { error: 'key must be a 40-char lowercase hex string or {sessionId}_{localId}' }, `key="${key}"`);
  }

  const filePath = hexPathMap.get(key);
  if (!filePath || !fs.existsSync(filePath)) {
    return sendError(res, 'GET /hex/:key', 404, { error: `component not found: ${key}` }, `key="${key}"`);
  }

  logger.info('GET /hex/:key 命中', { key, path: filePath });
  res.set('Content-Type', 'text/plain; charset=utf-8');
  fs.createReadStream(filePath).pipe(res);
});

app.get('/get-index', (req, res) => {
  logger.info('GET /get-index 收到请求');
  if (!fs.existsSync(SEARCH_INDEX_PATH)) {
    return sendError(res, 'GET /get-index', 404, { error: 'search_index.json not found' });
  }
  const data = JSON.parse(fs.readFileSync(SEARCH_INDEX_PATH, 'utf8'));
  res.json(data);
});

app.listen(PORT, () => {
  logger.info('lib-admin-service 已启动', { port: PORT, LIB_OUT_DIR, SEARCH_INDEX_PATH });
});