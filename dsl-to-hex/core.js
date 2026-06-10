'use strict';

const { convert, getWasm } = require('./converter');

async function init() {
  await getWasm();
}

function getStats() {
  return { wasmLoaded: true };
}

module.exports = { init, convert, getStats };