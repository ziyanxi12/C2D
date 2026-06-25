'use strict';

const http  = require('http');
const https = require('https');

// VECTOR_SERVICE_URL 和 VECTOR_TIMEOUT_MS 由 server.js / .env 加载后通过 process.env 传入，
// 这里用 getter 延迟读取，确保 .env 解析完成后才取值
const baseUrl   = () => process.env.VECTOR_SERVICE_URL  || 'http://localhost:8000';
const timeoutMs = () => Number(process.env.VECTOR_TIMEOUT_MS) || 10_000;

function post(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url  = new URL(urlStr);
    const mod  = url.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);

    const req = mod.request(
      {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname + url.search,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: timeoutMs(),
      },
      res => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { buf += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`vector service ${res.statusCode}: ${buf.slice(0, 200)}`));
          }
          try { resolve(JSON.parse(buf)); }
          catch { reject(new Error(`invalid JSON from vector service: ${buf.slice(0, 200)}`)); }
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error(`vector service timeout after ${timeoutMs()}ms`)));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 单条查询，返回 top-N 数组：
// [{ score, domain, symbol_id, variant_key, component_set_key, path, canvas_name, variant_name }, ...]
function searchComponent(query) {
  return post(`${baseUrl()}/api/search/component`, { query });
}

// 批量查询，返回与 queries 等长的数组，每项是对应 query 的 top-N 结果数组
function searchComponentBatch(queries) {
  return post(`${baseUrl()}/api/search/component/batch`, { queries });
}

module.exports = { searchComponent, searchComponentBatch };
