'use strict';

const path         = require('path');
const SplitCompset = require('./bin/split_compset.js');

// ─── 参数 ────────────────────────────────────────────────────────────────────
// node index.js <complib.pix> <outdir> [publishFile] [domain] [--no-hex]
//
// 示例：
//   node index.js "lib/ICT UI_v3.1.1_PC端组件库（新）.pix" harmony_out
//   node index.js "lib/ICT UI_v3.1.1_PC端组件库（新）.pix" harmony_out QcO-1WDViGmGQ4IFU_p4FQ
//   node index.js "lib/ICT UI_v3.1.1_PC端组件库（新）.pix" harmony_out QcO-1WDViGmGQ4IFU_p4FQ mydomain
//   node index.js "lib/ICT UI_v3.1.1_PC端组件库（新）.pix" harmony_out --no-hex

const args = process.argv.slice(2).filter(a => a !== '--no-hex');
const noHex = process.argv.slice(2).includes('--no-hex');

if (args.length < 2) {
    console.error(
        'Usage: node index.js <complib.pix> <outdir> [publishFile] [domain] [--no-hex]\n\n' +
        'Example:\n' +
        '  node index.js "lib/ICT UI_v3.1.1_PC端组件库（新）.pix" harmony_out\n' +
        '  node index.js "lib/ICT UI_v3.1.1_PC端组件库（新）.pix" harmony_out QcO-1WDViGmGQ4IFU_p4FQ\n' +
        '  node index.js "lib/ICT UI_v3.1.1_PC端组件库（新）.pix" harmony_out QcO-1WDViGmGQ4IFU_p4FQ mydomain\n' +
        '  node index.js "lib/ICT UI_v3.1.1_PC端组件库（新）.pix" harmony_out --no-hex\n'
    );
    process.exit(1);
}

const pixPath     = path.resolve(args[0]);
const outDir      = path.resolve(args[1]);
const publishFile = args[2] || '';
const domain      = args[3] || '';

// ─── 执行 ────────────────────────────────────────────────────────────────────
SplitCompset().then(mod => {
    console.log('组件库:', pixPath);
    console.log('输出  :', outDir);
    if (noHex) console.log('模式  : --no-hex（只输出 JSON）');

    const t0     = Date.now();
    const result = mod.splitCompset(pixPath, outDir, publishFile, domain, !noHex);
    const ms     = Date.now() - t0;

    const parsed = JSON.parse(result);
    if (parsed.error) {
        console.error('错误:', result);
        process.exit(1);
    }

    console.log(`耗时: ${ms} ms`);
    console.log('结果:', result);
}).catch(err => {
    console.error('WASM 初始化失败:', err);
    process.exit(1);
});
