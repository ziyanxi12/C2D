'use strict';

const fs   = require('fs');
const path = require('path');

// ─── 用法 ──────────────────────────────────────────────────────
//   node runner.js <work_dir>
//
// work_dir/ 结构（由 Flask app.py 创建）:
//   config.json     — 运行配置（模块信息 + 参数定义 + 参数值）
//   <上传文件>      — Flask 保存的上传文件
//   output/         — 输出目录（Flask 预创建）
//
// 输出: stdout 最后一行是 JSON
//   { "success": true, "result": "...", "output_files": ["output/xxx", ...] }
//   { "success": false, "error": "..." }

const workDir = process.argv[2];
if (!workDir) {
    console.error('Usage: node runner.js <work_dir>');
    process.exit(1);
}

const appRoot = path.resolve(__dirname, '..');

// ─── 读取运行配置 ──────────────────────────────────────────────

const configPath = path.join(workDir, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const {
    wasm_path:        wasmPath,
    export_name:      exportName,
    entry_function:   entryFunction,
    params:           paramDefs,
    param_values:     paramValues,
} = config;

// ─── 解析 WASM 路径 ────────────────────────────────────────────

const wasmJsPath = path.isAbsolute(wasmPath)
    ? wasmPath
    : path.join(appRoot, wasmPath);

if (!fs.existsSync(wasmJsPath)) {
    outputError(`WASM file not found: ${wasmJsPath}`);
    process.exit(1);
}

// ─── 构造调用参数 ──────────────────────────────────────────────

function buildArgs() {
    const args = [];
    for (const def of paramDefs) {
        if (def.type === 'file') {
            const filename = paramValues[def.name];
            if (!filename) {
                if (def.required) {
                    throw new Error(`missing required file param: ${def.name}`);
                }
                args.push('');
            } else {
                args.push(path.join(workDir, filename));
            }
        } else if (def.type === 'output_dir') {
            const outDir = path.join(workDir, 'output');
            fs.mkdirSync(outDir, { recursive: true });
            args.push(outDir);
        } else if (def.type === 'string') {
            args.push(paramValues[def.name] || def.default || '');
        } else {
            throw new Error(`unknown param type: ${def.type} (${def.name})`);
        }
    }
    return args;
}

// ─── 扫描输出目录 ──────────────────────────────────────────────

function scanOutput() {
    const outputDir = path.join(workDir, 'output');
    if (!fs.existsSync(outputDir)) return [];
    const results = [];
    function walk(dir, relPrefix) {
        for (const entry of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, entry);
            const relPath = relPrefix + '/' + entry;
            if (fs.statSync(fullPath).isDirectory()) {
                walk(fullPath, relPath);
            } else {
                results.push(relPath);
            }
        }
    }
    walk(outputDir, 'output');
    return results;
}

// ─── 输出 JSON ────────────────────────────────────────────────

function outputResult(obj) {
    console.log(JSON.stringify(obj));
}

function outputError(msg) {
    outputResult({ success: false, error: msg });
}

// ─── 主流程 ────────────────────────────────────────────────────

async function main() {
    const WasmModule = require(wasmJsPath);
    const mod = await WasmModule();

    const args = buildArgs();
    const result = mod[entryFunction](...args);

    // 检查 WASM 返回的错误
    let success = true;
    let errorMsg = null;
    if (typeof result === 'string' && result.startsWith('{"error"')) {
        success = false;
        try {
            errorMsg = JSON.parse(result).error;
        } catch (_) {
            errorMsg = result;
        }
    }

    outputResult({
        success,
        error: errorMsg,
        result: typeof result === 'string' ? result : String(result),
        output_files: scanOutput(),
    });
}

main().catch(err => {
    outputError(err.message);
    process.exit(1);
});
