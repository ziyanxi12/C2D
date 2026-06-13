'use strict';

const path    = require('path');
const fs      = require('fs');
const DslToHex = require('./bin/dsl_to_hex.js');

// ─── 参数 ────────────────────────────────────────────────────────────────────
// node index.js <dsl.json> <component_dir> [out.txt] [--table-template <tmpl.txt>]

const rawArgs = process.argv.slice(2);

let tableTemplatePath = '';
const args = [];
for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--table-template' && i + 1 < rawArgs.length) {
        tableTemplatePath = path.resolve(rawArgs[++i]);
    } else {
        args.push(rawArgs[i]);
    }
}

if (args.length < 2) {
    console.error(
        'Usage: node index.js <dsl.json> <component_dir> [out.txt] [--table-template <tmpl.txt>]\n\n' +
        'Example:\n' +
        '  node index.js dsl.json comp_dir\n' +
        '  node index.js dsl.json comp_dir out.txt --table-template table.txt\n'
    );
    process.exit(1);
}

const dslPath = path.resolve(args[0]);
const compDir = path.resolve(args[1]);
const outPath = args[2] ? path.resolve(args[2]) : null;

// ─── 执行 ────────────────────────────────────────────────────────────────────
DslToHex().then(mod => {
    console.log('DSL :', dslPath);
    console.log('组件:', compDir);
    if (tableTemplatePath) console.log('表格模版:', tableTemplatePath);

    const t0     = Date.now();
    const result = mod.dslToHex(dslPath, compDir, tableTemplatePath);
    const ms     = Date.now() - t0;

    if (result.startsWith('{"error"')) {
        console.error('错误:', result);
        process.exit(1);
    }

    const hexLine = result.split('\n')[1] || result;
    console.log(`耗时: ${ms} ms  |  hex: ${hexLine.length} chars`);

    if (outPath) {
        fs.writeFileSync(outPath, result, 'utf8');
        console.log('输出:', outPath);
    } else {
        console.log('预览:', hexLine.slice(0, 80) + '...');
    }
}).catch(err => {
    console.error('WASM 初始化失败:', err);
    process.exit(1);
});
