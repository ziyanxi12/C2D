'use strict';

const path               = require('path');
const fs                 = require('fs');
const CompsetInstantiate = require('./bin/compset_instantiate.js');

// =============================================================================
// 用法
// =============================================================================
//
// node index.js <component_index.json> <base_dir> [名称过滤...] [--outdir <dir>]
//
// component_index.json : 组件集索引文件（split_compset 输出）
// base_dir             : hexFile 路径的基准目录
// [名称过滤...]        : 可选，按 name 字段过滤（支持 componentSets 和 standaloneComponents）
// --outdir <dir>       : 可选，输出根目录；默认 output/
//
// 输出：每个变体 / 独立组件生成一个 hex 文件，打平放在 outdir 下：
//   <outdir>/<variantKey>.hex          (componentSets 变体，有 key 时)
//   <outdir>/<componentKey>.hex        (standaloneComponents，有 key 时)
//   <outdir>/<guidS>_<guidL>.hex       (key 为空时的 fallback)
//
// 示例：
//   node index.js component_index.json base_dir "文字链接"
//   node index.js component_index.json base_dir "文字链接" "2.拖拽把手"
//   node index.js component_index.json base_dir --outdir /tmp/instances
// =============================================================================

const rawArgs = process.argv.slice(2);

if (rawArgs.length < 2) {
    console.error(
        'Usage: node index.js <component_index.json> <base_dir> [名称过滤...] [--outdir <dir>]\n\n' +
        'Examples:\n' +
        '  node index.js component_index.json base_dir "文字链接"\n' +
        '  node index.js component_index.json base_dir "文字链接" "2.拖拽把手"\n' +
        '  node index.js component_index.json base_dir --outdir /tmp/instances\n'
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

const indexPath  = path.resolve(positional[0]);
const baseDir    = path.resolve(positional[1]);
const nameFilter = positional.slice(2);

if (!fs.existsSync(indexPath)) {
    console.error(`错误: 索引文件不存在: ${indexPath}`);
    process.exit(1);
}
if (!fs.existsSync(baseDir)) {
    console.error(`错误: base_dir 不存在: ${baseDir}`);
    process.exit(1);
}

if (!outDir) outDir = path.join(__dirname, 'output');
fs.mkdirSync(outDir, { recursive: true });

// =============================================================================
// 执行
// =============================================================================

console.log('=== compset_instantiate ===');
console.log('index  :', indexPath);
console.log('base   :', baseDir);
console.log('filter :', nameFilter.length === 0 ? '(全部)' : nameFilter.join(', '));
console.log('outdir :', outDir);
console.log('');

CompsetInstantiate().then(mod => {
    const t0     = Date.now();
    const result = mod.instantiateCompSet(
        indexPath,
        baseDir,
        nameFilter.join(',')
    );
    const wasmMs = Date.now() - t0;

    // 失败：JSON error（以 { 开头）
    if (result.startsWith('{')) {
        let parsed;
        try { parsed = JSON.parse(result); } catch (e) { parsed = { error: result }; }
        console.error('错误:', parsed.error || result);
        process.exit(1);
    }

    // 成功：JSON 数组
    let items;
    try { items = JSON.parse(result); } catch (e) {
        console.error('WASM 返回解析失败:', e.message);
        process.exit(1);
    }

    if (!Array.isArray(items) || items.length === 0) {
        console.error('没有可输出的变体');
        process.exit(1);
    }

    // 写文件：outdir/<key>.hex  （打平，不分子目录）
    let written = 0;
    for (const item of items) {
        const hexFile = path.join(outDir, item.key + '.hex');
        fs.writeFileSync(hexFile, item.hex, 'utf8');
        written++;
    }

    const totalMs = Date.now() - t0;
    console.log(`✓ 完成  WASM: ${wasmMs} ms  写文件: ${totalMs - wasmMs} ms`);
    console.log(`  总计: ${written} 个 hex 文件`);
    console.log(`  输出目录: ${outDir}`);

}).catch(err => {
    console.error('WASM 初始化失败:', err);
    process.exit(1);
});
