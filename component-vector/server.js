#!/usr/bin/env node
'use strict';

/**
 * 向量检索 HTTP API 服务。
 *
 * 启动：node server.js
 *
 * POST /api/search/component  { "query": "主要按钮悬停", "topK": 3 }
 * POST /api/search/icon       { "query": "下载文件", "topK": 5 }
 */

const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const { searchVariant } = require('./vector_search');
const { searchIcon }    = require('./icon_search');

// ── 读取 .env ─────────────────────────────────────────────────────────────────

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

const PORT = Number(process.env.PORT || 3100);

// ── 路由表 ────────────────────────────────────────────────────────────────────

const ROUTES = {
  'POST /api/search/component': async (body) => {
    const { query, topK = 1 } = body;
    if (!query) return { status: 400, body: { error: 'query is required' } };
    const results = await searchVariant(String(query), Number(topK));
    return { status: 200, body: { results } };
  },
  'POST /api/search/icon': async (body) => {
    const { query, topK = 1 } = body;
    if (!query) return { status: 400, body: { error: 'query is required' } };
    const results = await searchIcon(String(query), Number(topK));
    return { status: 200, body: { results } };
  },
};

// ── HTTP server ───────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const routeKey = `${req.method} ${req.url.split('?')[0]}`;
  const handler  = ROUTES[routeKey];

  if (!handler) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found', availableRoutes: Object.keys(ROUTES) }));
    return;
  }

  try {
    const body             = await readBody(req);
    const { status, body: resBody } = await handler(body);
    res.writeHead(status);
    res.end(JSON.stringify(resBody));
  } catch (err) {
    const status = err.status || 500;
    console.error(`[${routeKey}]`, err.message);
    res.writeHead(status);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`向量检索服务启动，监听 http://localhost:${PORT}`);
  console.log('  POST /api/search/component  { query, topK? }');
  console.log('  POST /api/search/icon       { query, topK? }');
});
