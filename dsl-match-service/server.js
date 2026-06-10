#!/usr/bin/env node
'use strict';

const fs                = require('fs');
const path              = require('path');
const express           = require('express');
const multer            = require('multer');
const { matchVariant, clearIndexCache } = require('./match_variant');
const { matchVariants }  = require('./batch_match');
const { matchDsl, matchDslSingle } = require('./match_dsl');

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
const PORT   = Number(process.env.PORT) || 3102;
const upload = multer({ storage: multer.memoryStorage() });

const SEARCH_INDEX_PATH = process.env.SEARCH_INDEX_PATH || '/Users/h30072573/lib/search_index.json';

app.use(express.json());

function logRouteResponse(label, status, message, extra) {
  const extraStr = extra ? ` (${extra})` : '';
  const line = `[${new Date().toISOString()}] ${label}${extraStr} 返回 ${status}：${message}`;
  if (status >= 500) console.error(line);
  else console.warn(line);
}

function sendError(res, label, status, payload, extra) {
  const message = (payload && typeof payload === 'object' && 'error' in payload)
    ? payload.error
    : JSON.stringify(payload);
  logRouteResponse(label, status, message, extra);
  return res.status(status).json(payload);
}

function logRouteEnter(label, extra) {
  const extraStr = extra ? ` (${extra})` : '';
  console.log(`[${new Date().toISOString()}] ${label}${extraStr} 收到请求`);
}

const MAX_DESCRIPTION_LENGTH = 200;

function checkDescription(desc) {
  if (desc === undefined || desc === null || desc === '') {
    return 'description is required';
  }
  if (typeof desc !== 'string') {
    return 'description must be a string';
  }
  const trimmed = desc.trim();
  if (!trimmed) {
    return 'description is required';
  }
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return `description too long (max ${MAX_DESCRIPTION_LENGTH} chars) — pass a short natural-language description, not a serialized object`;
  }
  if (/^[{\[]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return 'description must be a short natural-language text, not a serialized JSON object/array — extract a field like label/name first';
    } catch {
    }
  }
  return null;
}

app.get('/health', (req, res) => {
  const indexExists = fs.existsSync(SEARCH_INDEX_PATH);
  res.json({ status: 'ok', index_exists: indexExists });
});

app.post('/match', async (req, res) => {
  const { description } = req.body || {};
  const descLog = `description=${JSON.stringify(description)}`;
  logRouteEnter('POST /match', descLog);

  const descErr = checkDescription(description);
  if (descErr) {
    return sendError(res, 'POST /match', 400, { error: descErr }, descLog);
  }
  const trimmed = description.trim();
  try {
    const result = await matchVariant(trimmed);
    if (!result) return sendError(res, 'POST /match', 404, { error: 'no match found' }, `description="${trimmed}"`);
    console.log(`[server] POST /match (description="${trimmed}") ✓ 命中：${result.componentSetName} / ${result.variant?.name || '(standalone)'}`);
    res.json(result);
  } catch (err) {
    sendError(res, 'POST /match', 500, { error: err.message }, `description="${trimmed}"`);
  }
});

app.post('/batch', async (req, res) => {
  const body = req.body;
  let descriptions;
  logRouteEnter('POST /batch', `body 类型=${Array.isArray(body) ? 'array' : typeof body}`);

  if (Array.isArray(body)) {
    descriptions = body.map(x => (typeof x === 'string' ? x : x.description));
  } else if (Array.isArray(body?.descriptions)) {
    descriptions = body.descriptions;
  } else {
    return sendError(res, 'POST /batch', 400, { error: 'body must be an array or { descriptions: [] }' });
  }

  if (descriptions.length === 0) {
    return sendError(res, 'POST /batch', 400, { error: 'descriptions array is empty' });
  }
  if (descriptions.length > 100) {
    return sendError(res, 'POST /batch', 400, { error: 'max 100 descriptions per request' }, `实际 ${descriptions.length} 条`);
  }

  const invalid = [];
  descriptions.forEach((d, i) => {
    const err = checkDescription(d);
    if (err) invalid.push({ index: i, error: err });
  });
  if (invalid.length > 0) {
    return sendError(res, 'POST /batch', 400, { error: 'invalid descriptions', details: invalid }, `${invalid.length}/${descriptions.length} 条不合法`);
  }

  console.log(`[server] POST /batch → 开始批量匹配 ${descriptions.length} 条描述（内部 5 并发）`);
  try {
    const results = await matchVariants(descriptions.map(d => d?.trim?.() ?? d));
    const hit = results.filter(r => r && !r.error).length;
    console.log(`[server] POST /batch ✓ 完成：${descriptions.length} 条中 ${hit} 条命中`);
    res.json(results);
  } catch (err) {
    sendError(res, 'POST /batch', 500, { error: err.message }, `${descriptions.length} 条描述`);
  }
});

function readDslRequestBody(req, res, label) {
  if (req.file) {
    console.log(`[server] ${label} → multipart 文件上传：${req.file.originalname}（${req.file.size} 字节）`);
    try {
      return JSON.parse(req.file.buffer.toString('utf8'));
    } catch {
      sendError(res, label, 400, { error: 'uploaded file is not valid JSON' }, req.file.originalname);
      return undefined;
    }
  }
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    console.log(`[server] ${label} → JSON body，根节点 keys=[${Object.keys(req.body).join(', ')}]`);
    return req.body;
  }
  sendError(res, label, 400, { error: 'send a file via -F "file=@page.json" or a JSON body' });
  return undefined;
}

app.post('/match-dsl', upload.single('file'), async (req, res) => {
  logRouteEnter('POST /match-dsl');
  const nodeData = readDslRequestBody(req, res, 'POST /match-dsl');
  if (nodeData === undefined) return;

  try {
    const results = await matchDsl(nodeData);
    const hit = results.filter(r => r.match).length;
    console.log(`[server] POST /match-dsl ✓ 完成：提取到 ${results.length} 个可匹配节点，命中 ${hit} 个`);
    res.json(results);
  } catch (err) {
    sendError(res, 'POST /match-dsl', 500, { error: err.message });
  }
});

app.post('/match-dsl-single', upload.single('file'), async (req, res) => {
  logRouteEnter('POST /match-dsl-single');
  const nodeData = readDslRequestBody(req, res, 'POST /match-dsl-single');
  if (nodeData === undefined) return;

  try {
    const results = await matchDslSingle(nodeData);
    const hit = results.filter(r => r.match).length;
    console.log(`[server] POST /match-dsl-single ✓ 完成：提取到 ${results.length} 个可匹配节点，命中 ${hit} 个`);
    res.json(results);
  } catch (err) {
    sendError(res, 'POST /match-dsl-single', 500, { error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`dsl-match-service 已启动: http://localhost:${PORT}`);
  console.log(`SEARCH_INDEX_PATH: ${SEARCH_INDEX_PATH}`);
});