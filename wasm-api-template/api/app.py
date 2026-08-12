#!/usr/bin/env python3
"""
通用 C++ WASM API 服务

端点:
  GET  /health        健康检查
  GET  /api/info      模块信息（名称、参数定义）
  POST /api/execute   执行（multipart: 文件上传 + JSON 参数）
"""

import io
import os
import json
import shutil
import tempfile
import zipfile
import subprocess
from pathlib import Path

import yaml
from flask import Flask, request, jsonify, send_file

# ── 配置加载（启动时读取一次） ────────────────────────────────────────────────

APP_DIR      = Path(__file__).resolve().parent.parent
CONFIG_PATH  = APP_DIR / 'config.yaml'
BRIDGE_PATH  = APP_DIR / 'bridge' / 'runner.js'

with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
    CONFIG = yaml.safe_load(f)

MODULE_NAME       = CONFIG['module']['name']
WASM_PATH         = CONFIG['module']['wasm_path']
EXPORT_NAME       = CONFIG['module']['export_name']
ENTRY_FUNCTION    = CONFIG['module']['entry_function']
API_PORT          = CONFIG['api'].get('port', 5000)
MAX_CONTENT_MB    = CONFIG['api'].get('max_content_length_mb', 500)
TIMEOUT_SEC       = CONFIG['api'].get('timeout_sec', 600)
PARAMS            = CONFIG.get('params', [])

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_MB * 1024 * 1024


# ── 端点 ──────────────────────────────────────────────────────────────────────

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'module': MODULE_NAME})


@app.route('/api/info')
def info():
    return jsonify({
        'module':         MODULE_NAME,
        'entry_function': ENTRY_FUNCTION,
        'params':         PARAMS,
    })


@app.route('/api/execute', methods=['POST'])
def execute():
    # 1. 解析请求参数
    param_values = {}

    if 'params' in request.form:
        try:
            param_values = json.loads(request.form['params'])
        except json.JSONDecodeError:
            return jsonify({'error': 'params is not valid JSON'}), 400
    elif request.is_json:
        param_values = request.get_json()

    # 2. 创建临时工作目录
    work_dir = tempfile.mkdtemp(prefix='wasm_')
    os.makedirs(os.path.join(work_dir, 'output'), exist_ok=True)

    try:
        # 3. 保存上传文件
        for param in PARAMS:
            if param['type'] != 'file':
                continue
            file = request.files.get(param['name'])
            if file and file.filename:
                filename = file.filename
                file.save(os.path.join(work_dir, filename))
                param_values[param['name']] = filename
            elif param.get('required', False):
                return jsonify({'error': f'missing required file: {param["name"]}'}), 400

        # 4. 验证 string 类型必需参数
        for param in PARAMS:
            if param.get('required', False) and param['type'] == 'string':
                if param['name'] not in param_values:
                    return jsonify({'error': f'missing required param: {param["name"]}'}), 400

        # 5. 写 config.json（供 runner.js 读取）
        runner_config = {
            'wasm_path':       WASM_PATH,
            'export_name':     EXPORT_NAME,
            'entry_function':  ENTRY_FUNCTION,
            'params':          PARAMS,
            'param_values':    param_values,
        }
        with open(os.path.join(work_dir, 'config.json'), 'w', encoding='utf-8') as f:
            json.dump(runner_config, f, ensure_ascii=False)

        # 6. 调用 Node.js 桥接层
        result = subprocess.run(
            ['node', str(BRIDGE_PATH), work_dir],
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SEC,
            cwd=str(APP_DIR),
        )

        # 7. 解析 runner.js 输出
        if result.returncode != 0:
            return jsonify({
                'error':  'runner.js exited with non-zero code',
                'stderr': result.stderr,
                'stdout': result.stdout,
            }), 500

        stdout_lines = result.stdout.strip().split('\n')
        try:
            output = json.loads(stdout_lines[-1])
        except json.JSONDecodeError:
            return jsonify({
                'error':  'cannot parse runner.js output',
                'stdout': result.stdout,
                'stderr': result.stderr,
            }), 500

        if not output.get('success'):
            return jsonify({
                'error':   output.get('error', 'unknown error'),
                'details': output,
            }), 500

        # 8. 判断返回方式：有输出文件 → zip 下载；无文件 → JSON
        output_files = output.get('output_files', [])

        if output_files:
            mem_zip = io.BytesIO()
            with zipfile.ZipFile(mem_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
                for rel_path in output_files:
                    abs_path = os.path.join(work_dir, rel_path)
                    if os.path.isfile(abs_path):
                        zf.write(abs_path, rel_path)
            mem_zip.seek(0)

            return send_file(
                mem_zip,
                as_attachment=True,
                download_name='result.zip',
                mimetype='application/zip',
            )
        else:
            return jsonify({
                'success': True,
                'result':  output.get('result'),
            })

    except subprocess.TimeoutExpired:
        return jsonify({'error': f'execution timeout ({TIMEOUT_SEC}s)'}), 504
    finally:
        # 临时目录清理
        # zip 响应: 数据已读入 BytesIO，安全删除
        # JSON 响应: JSON 已构造，安全删除
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=API_PORT)
