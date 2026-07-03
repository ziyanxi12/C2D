'use strict';

// 用法: node check.js <component_index.json> [outdir]
//
// 对比 index 里所有预期 key 与 outdir 里实际生成的文件，找出缺失（失败）的条目。

const path = require('path');
const fs   = require('fs');

const [,, indexArg, outdirArg] = process.argv;

if (!indexArg) {
    console.error('Usage: node check.js <component_index.json> [outdir]');
    process.exit(1);
}

const indexPath = path.resolve(indexArg);
const outDir    = path.resolve(outdirArg || path.join(__dirname, 'output'));

if (!fs.existsSync(indexPath)) { console.error('找不到:', indexPath); process.exit(1); }
if (!fs.existsSync(outDir))    { console.error('找不到:', outDir);    process.exit(1); }

const index   = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const present = new Set(fs.readdirSync(outDir).filter(f => f.endsWith('.hex')).map(f => f.slice(0, -4)));

// guid 格式: "8229:277395"，fallback 时冒号换下划线
function resolveKey(hash, guid) {
    if (hash && hash.length > 0) return hash;
    return (guid || '').replace(':', '_');
}

const missing = [];

for (const cs of (index.componentSets || [])) {
    for (const v of (cs.variants || [])) {
        const key = resolveKey(v.variantKey, v.guid);
        if (!present.has(key)) {
            missing.push({ type: 'componentSet', setName: cs.name, name: v.name || '', key });
        }
    }
}

for (const sc of (index.standaloneComponents || [])) {
    const key = resolveKey(sc.componentKey, sc.guid);
    if (!present.has(key)) {
        missing.push({ type: 'standalone', setName: '', name: sc.name, key });
    }
}

if (missing.length === 0) {
    console.log(`✓ 全部生成，共 ${present.size} 个文件`);
    process.exit(0);
}

console.log(`缺失 ${missing.length} 个（output 目录: ${outDir}）\n`);
for (const m of missing) {
    const label = m.type === 'componentSet' ? `[${m.setName}] ${m.name}` : m.name;
    console.log(`  ✗  ${label}  →  ${m.key}.hex`);
}
