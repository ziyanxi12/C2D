'use strict';

const { matchDsl } = require('./match_dsl');
const { loadIndex } = require('./match_variant');

let _initialized = false;
let _stats = null;

async function init() {
  if (_initialized) return;
  const { entries } = loadIndex();
  _stats = {
    entries_count: entries.length,
    loaded_at: new Date().toISOString()
  };
  _initialized = true;
}

async function matchDslNodes(data) {
  if (!_initialized) await init();
  return matchDsl(data);
}

function getStats() {
  return _initialized ? { ..._stats } : { status: 'not_initialized' };
}

module.exports = { init, matchDslNodes, getStats };