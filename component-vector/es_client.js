'use strict';

const { Client } = require('@elastic/elasticsearch');

const ES_URL      = process.env.ES_URL      || 'http://localhost:9200';
const ES_USERNAME = process.env.ES_USERNAME || 'elastic';
const ES_PASSWORD = process.env.ES_PASSWORD || '';

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Client({
      node: ES_URL,
      auth: { username: ES_USERNAME, password: ES_PASSWORD },
      tls:  { rejectUnauthorized: false }, // 自签证书兼容
    });
  }
  return _client;
}

module.exports = { getClient };
