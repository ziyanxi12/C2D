'use strict';

const path               = require('path');
const fs                 = require('fs');
const CompsetInstantiate = require('./bin/compset_instantiate.js');

// =============================================================================
// 用法
// =============================================================================
//
// node index.js <component_index.json> <base_dir> [组件集名称...] [--output <out.hex>]
//
// component_index.json : 组件集索引文件（split_compset 输出）
// base_dir             : hexFile 路径的基准目录（通常是 index 文件所在目录的父目录）
// [组件集名称...]      : 可选，过滤组件集（不传 = 全部）
// --output <out.hex>   : 可选，指定输出路径；默认放在 base_dir 下
//
// 示例：
//   node index.js ../split_compset/wasm_test_out/component/component_index.json \
//                 ../split_compset/wasm_test_out
//
//   node index.js component_index.json wasm_test_out "文字链接" "1.按钮"
//
//   node index.js component_index.json wasm_test_out "文字链接" \
//                 --output /tmp/wenziliangjie_instances.hex
// =============================================================================

const rawArgs = process.argv.slice(2);

if (rawArgs.length < 2) {
    console.error(
        'Usage: node index.js <component_index.json> <base_dir> [组件集名称...] [--output <out.hex>]\n\n' +
        'Examples:\n' +
        '  node index.js component_index.json wasm_test_out\n' +
        '  node index.js component_index.json wasm_test_out "文字链接" "1.按钮"\n' +
        '  node index.js component_index.json wasm_test_out "文字链接" --output result.hex\n'
    );
    process.exit(1);
}

// 解析参数
let outputPath = '';
const positional = [];

for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--output' && i + 1 < rawArgs.length) {
        outputPath = path.resolve(rawArgs[++i]);
    } else {
        positional.push(rawArgs[i]);
    }
}

const indexPath = path.resolve(positional[0]);
const baseDir   = path.resolve(positional[1]);
const setNames  = positional.slice(2);  // 可能为空（全部）

// 校验输入
if (!fs.existsSync(indexPath)) {
    console.error(`错误: 索引文件不存在: ${indexPath}`);
    process.exit(1);
}
if (!fs.existsSync(baseDir)) {
    console.error(`错误: base_dir 不存在: ${baseDir}`);
    process.exit(1);
}

// 自动生成输出路径（如果未指定）
// 默认输出到 index.js 同级的 output/ 目录
if (!outputPath) {
    const label = setNames.length === 0
        ? 'all'
        : setNames.length === 1
            ? setNames[0].replace(/[\/\\:*?"<>|]/g, '_')  // 文件名安全
            : `${setNames.length}sets`;
    outputPath = path.join(__dirname, 'output', `${label}_instances.hex`);
}

// 确保输出目录存在
const outDir = path.dirname(outputPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// =============================================================================
// 执行
// =============================================================================

console.log('=== compset_instantiate ===');
console.log('index :', indexPath);
console.log('base  :', baseDir);
console.log('sets  :', setNames.length === 0 ? '(全部)' : setNames.join(', '));
console.log('output:', outputPath);
console.log('');

CompsetInstantiate().then(mod => {
    const t0     = Date.now();
    // WASM 返回 hex 字符串（成功）或 JSON error 字符串（失败）
    // 文件写入在 JS 层完成，避免 WASM fopen 中文路径问题
    const result = mod.instantiateCompSet(
        indexPath,
        baseDir,
        setNames.join(',')   // 逗号分隔，空字符串 = 全部
    );
    const ms = Date.now() - t0;

    // 失败：返回 JSON（以 { 开头）
    if (result.startsWith('{')) {
        let parsed;
        try { parsed = JSON.parse(result); } catch (e) { parsed = { error: result }; }
        console.error('错误:', parsed.error || result);
        process.exit(1);
    }

    // 成功：result 就是 hex 内容，由 JS 写文件
    fs.writeFileSync(outputPath, result, 'utf8');
    const hexLine = result.split('\n')[1] || '';

    console.log(`✓ 完成  耗时: ${ms} ms`);
    console.log(`  hex字符: ${hexLine.length}`);
    console.log(`  输出文件: ${outputPath}`);

}).catch(err => {
    console.error('WASM 初始化失败:', err);
    process.exit(1);
});
