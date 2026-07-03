'use strict';

const path               = require('path');
const fs                 = require('fs');
const CompsetInstantiate = require('./bin/compset_instantiate.js');

// =============================================================================
// 用法
// =============================================================================
//
// node index.js <component_index.json> <base_dir> [名称过滤...] [--outdir <dir>] [--batch <n>]
//
// component_index.json : 组件集索引文件（split_compset 输出）
// base_dir             : hexFile 路径的基准目录
// [名称过滤...]        : 可选，按 name 字段过滤（支持 componentSets 和 standaloneComponents）
// --outdir <dir>       : 可选，输出根目录；默认 output/
// --batch  <n>         : 可选，每批处理的组件数量；默认 20
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
//   node index.js component_index.json base_dir --batch 10
// =============================================================================

const rawArgs = process.argv.slice(2);

if (rawArgs.length < 2) {
    console.error(
        'Usage: node index.js <component_index.json> <base_dir> [名称过滤...] [--outdir <dir>] [--batch <n>]\n\n' +
        'Examples:\n' +
        '  node index.js component_index.json base_dir "文字链接"\n' +
        '  node index.js component_index.json base_dir "文字链接" "2.拖拽把手"\n' +
        '  node index.js component_index.json base_dir --outdir /tmp/instances\n' +
        '  node index.js component_index.json base_dir --batch 10\n'
    );
    process.exit(1);
}

// 解析参数
let outDir    = '';
let batchSize = 20;
const positional = [];

for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--outdir' && i + 1 < rawArgs.length) {
        outDir = path.resolve(rawArgs[++i]);
    } else if (rawArgs[i] === '--batch' && i + 1 < rawArgs.length) {
        batchSize = parseInt(rawArgs[++i], 10) || 20;
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

// 从 index.json 读取所有组件名（按 nameFilter 过滤）
function resolveNames(indexPath, nameFilter) {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const names = [];
    for (const cs of (index.componentSets || [])) {
        if (nameFilter.length === 0 || nameFilter.includes(cs.name)) {
            names.push(cs.name);
        }
    }
    for (const sc of (index.standaloneComponents || [])) {
        if (nameFilter.length === 0 || nameFilter.includes(sc.name)) {
            names.push(sc.name);
        }
    }
    return names;
}

function chunk(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
    return result;
}

// =============================================================================
// 执行
// =============================================================================

const allNames = resolveNames(indexPath, nameFilter);
const batches  = chunk(allNames, batchSize);

console.log('=== compset_instantiate ===');
console.log('index  :', indexPath);
console.log('base   :', baseDir);
console.log('filter :', nameFilter.length === 0 ? '(全部)' : nameFilter.join(', '));
console.log('outdir :', outDir);
console.log(`共 ${allNames.length} 个组件，分 ${batches.length} 批（每批 ${batchSize}）`);
console.log('');

CompsetInstantiate().then(mod => {
    const t0           = Date.now();
    let totalWritten   = 0;
    let totalFailed    = 0;

    for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        console.log(`── 批次 ${bi + 1}/${batches.length}  [${batch.join(' | ')}]`);

        const bt     = Date.now();
        let result;
        try {
            result = mod.instantiateCompSet(indexPath, baseDir, batch.join(','));
        } catch (e) {
            console.error(`  ✗ WASM 异常: ${e.message}`);
            totalFailed += batch.length;
            console.log('');
            continue;
        }
        const wasmMs = Date.now() - bt;

        // WASM 返回错误对象
        if (result.startsWith('{')) {
            let parsed;
            try { parsed = JSON.parse(result); } catch (_) { parsed = { error: result }; }
            console.error(`  ✗ 批次失败: ${parsed.error || result}`);
            totalFailed += batch.length;
            console.log('');
            continue;
        }

        // 解析结果数组
        let items;
        try { items = JSON.parse(result); } catch (e) {
            console.error(`  ✗ 解析失败: ${e.message}`);
            totalFailed += batch.length;
            console.log('');
            continue;
        }

        // 逐个写文件，打印每条结果
        let batchOk = 0;
        let batchErr = 0;
        for (const item of items) {
            const hexFile = path.join(outDir, item.key + '.hex');
            try {
                fs.writeFileSync(hexFile, item.hex, 'utf8');
                console.log(`  ✓ ${item.name}  →  ${item.key}.hex`);
                batchOk++;
            } catch (e) {
                console.error(`  ✗ ${item.name}  [${item.key}]  写入失败: ${e.message}`);
                batchErr++;
            }
        }

        totalWritten += batchOk;
        totalFailed  += batchErr;
        console.log(`  批次完成: ${batchOk} 成功  ${batchErr} 失败  耗时 ${wasmMs} ms`);
        console.log('');
    }

    const totalMs = Date.now() - t0;
    console.log('=== 汇总 ===');
    console.log(`成功: ${totalWritten}  失败: ${totalFailed}  总耗时: ${totalMs} ms`);
    console.log(`输出: ${outDir}`);

    if (totalFailed > 0) process.exit(1);

}).catch(err => {
    console.error('WASM 初始化失败:', err);
    process.exit(1);
});
