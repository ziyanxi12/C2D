'use strict';

const path               = require('path');
const fs                 = require('fs');
const CompsetInstantiate = require('./bin/compset_instantiate.js');

// =============================================================================
// 用法
// =============================================================================
//
// node index.js <component_index.json> <base_dir> [组件集名称...] [--outdir <dir>]
//
// component_index.json : 组件集索引文件（split_compset 输出）
// base_dir             : hexFile 路径的基准目录
// [组件集名称...]      : 可选，过滤组件集；不传 = 全部
// --outdir <dir>       : 可选，输出目录；默认 output/<组件集名>/
//
// 每个变体输出一个独立的 hex 文件：
//   <outdir>/<组件集名>/<变体名>.hex
//
// 示例：
//   node index.js component_index.json wasm_test_out "文字链接"
//   node index.js component_index.json wasm_test_out "文字链接" "1.按钮"
//   node index.js component_index.json wasm_test_out --outdir /tmp/instances
// =============================================================================

const rawArgs = process.argv.slice(2);

if (rawArgs.length < 2) {
    console.error(
        'Usage: node index.js <component_index.json> <base_dir> [组件集名称...] [--outdir <dir>]\n\n' +
        'Examples:\n' +
        '  node index.js component_index.json wasm_test_out "文字链接"\n' +
        '  node index.js component_index.json wasm_test_out "文字链接" "1.按钮"\n' +
        '  node index.js component_index.json wasm_test_out --outdir /tmp/instances\n'
    );
    process.exit(1);
}

// 解析参数
let outDir = '';
const positional = [];

for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--outdir' && i + 1 < rawArgs.length) {
        outDir = path.resolve(rawArgs[++i]);
    } else {
        positional.push(rawArgs[i]);
    }
}

const indexPath = path.resolve(positional[0]);
const baseDir   = path.resolve(positional[1]);
const setNames  = positional.slice(2);

// 校验输入
if (!fs.existsSync(indexPath)) {
    console.error(`错误: 索引文件不存在: ${indexPath}`);
    process.exit(1);
}
if (!fs.existsSync(baseDir)) {
    console.error(`错误: base_dir 不存在: ${baseDir}`);
    process.exit(1);
}

// 默认输出到 output/ 子目录
if (!outDir) {
    outDir = path.join(__dirname, 'output');
}

// 文件名安全化：将路径非法字符替换为下划线
function safeName(s) {
    return s.replace(/[\/\\:*?"<>|]/g, '_').trim();
}

// =============================================================================
// 执行
// =============================================================================

console.log('=== compset_instantiate ===');
console.log('index  :', indexPath);
console.log('base   :', baseDir);
console.log('sets   :', setNames.length === 0 ? '(全部)' : setNames.join(', '));
console.log('outdir :', outDir);
console.log('');

CompsetInstantiate().then(mod => {
    const t0     = Date.now();
    const result = mod.instantiateCompSet(
        indexPath,
        baseDir,
        setNames.join(',')
    );
    const wasmMs = Date.now() - t0;

    // 失败：返回 JSON error（以 { 开头）
    if (result.startsWith('{')) {
        let parsed;
        try { parsed = JSON.parse(result); } catch (e) { parsed = { error: result }; }
        console.error('错误:', parsed.error || result);
        process.exit(1);
    }

    // 成功：result 是 JSON 数组
    let items;
    try {
        items = JSON.parse(result);
    } catch (e) {
        console.error('WASM 返回解析失败:', e.message);
        process.exit(1);
    }

    if (!Array.isArray(items) || items.length === 0) {
        console.error('没有可输出的变体');
        process.exit(1);
    }

    // 写文件：outdir/<setName>/<variantName>.hex
    let written = 0;
    const bySet = {};

    for (const item of items) {
        const setDir  = path.join(outDir, safeName(item.setName));
        const hexFile = path.join(setDir, safeName(item.variantName) + '.hex');

        fs.mkdirSync(setDir, { recursive: true });
        // item.hex 中的 \n 已是真实换行（JSON.parse 已还原）
        fs.writeFileSync(hexFile, item.hex, 'utf8');
        written++;

        if (!bySet[item.setName]) bySet[item.setName] = 0;
        bySet[item.setName]++;
    }

    const totalMs = Date.now() - t0;

    console.log(`✓ 完成  WASM: ${wasmMs} ms  写文件: ${totalMs - wasmMs} ms`);
    console.log(`  总计: ${written} 个 hex 文件`);
    for (const [name, count] of Object.entries(bySet)) {
        console.log(`  └─ ${name}: ${count} 个变体`);
    }
    console.log(`  输出目录: ${outDir}`);

}).catch(err => {
    console.error('WASM 初始化失败:', err);
    process.exit(1);
});
