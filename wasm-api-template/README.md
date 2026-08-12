# wasm-api-template

通用 C++ → WASM → Python API 模板项目。

Docker 多阶段构建：**Stage 1** 用 emcc 编译 C++ 源码为 WASM，**Stage 2** 用 Node.js + Python 提供文件上传/下载的 HTTP API。

换 C++ 项目时只需替换 `src/` 源码 + 修改 `config.yaml`，`bridge/runner.js` 和 `api/app.py` 无需改动。

---

## 目录结构

```
wasm-api-template/
├── Dockerfile                    # 多阶段构建（emcc 编译 + Flask 运行时）
├── .dockerignore
├── config.yaml                   # 模块配置（换项目时改这个）
├── package.json                  # Node.js 依赖声明（零依赖）
│
├── src/                          # ← 放 C++ 源码的地方
│   ├── Makefile.wasm             # emcc 编译规则（改顶部变量即可）
│   └── main_wasm.cpp             # C++ WASM 入口（示例：文件反转）
│
├── bridge/
│   └── runner.js                 # Node.js 桥接层（通用，零依赖）
│
└── api/
    ├── app.py                    # Flask API 服务（通用）
    └── requirements.txt          # Python 依赖
```

---

## 架构

```
外部调用方
    │
    │  POST /api/execute (multipart: 文件 + JSON 参数)
    ▼
┌─ Flask API (api/app.py) ──────────────────────┐
│  1. 接收上传文件，写入临时目录                    │
│  2. 写 config.json（含模块配置 + 参数值）        │
│  3. spawn: node bridge/runner.js <work_dir>    │
│  4. 读取 stdout JSON                            │
│  5. 有输出文件 → zip 下载；无文件 → JSON 返回    │
│  6. 清理临时目录                                 │
└──────────┬────────────────────────────────────┘
           │ subprocess
           ▼
┌─ Node.js Bridge (bridge/runner.js) ───────────┐
│  1. 读取 work_dir/config.json                  │
│  2. require(wasm_path)() 加载 WASM             │
│  3. 按 params 定义构造调用参数                   │
│     - file → work_dir 内文件路径                │
│     - output_dir → work_dir/output 路径        │
│     - string → 从 param_values 取值            │
│  4. mod[entry_function](...args) 执行           │
│  5. WASM 通过 NODERAWFS 直接读写文件            │
│  6. stdout 输出 JSON 结果                       │
└───────────────────────────────────────────────┘
```

---

## 快速开始

### 1. 构建镜像

```bash
cd wasm-api-template
docker build -t my-wasm-api .
```

### 2. 运行

```bash
docker run -p 5000:5000 my-wasm-api
```

### 3. 调用 API

```bash
# 健康检查
curl http://localhost:5000/health

# 查看模块信息
curl http://localhost:5000/api/info

# 执行（上传文件 + 参数）
curl -X POST http://localhost:5000/api/execute \
  -F "input_file=@hello.txt" \
  -F 'params={"extra_param":"test123"}'

# 返回 zip 文件下载（有输出文件时）
# 或返回 JSON（无输出文件时）
```

---

## API 文档

### `GET /health`

健康检查。

```json
{ "status": "ok", "module": "my_module" }
```

### `GET /api/info`

返回模块信息和参数定义。

```json
{
  "module": "my_module",
  "entry_function": "run",
  "params": [
    { "name": "input_file", "type": "file", "required": true },
    { "name": "output_dir", "type": "output_dir", "required": true },
    { "name": "extra_param", "type": "string", "required": false, "default": "" }
  ]
}
```

### `POST /api/execute`

执行 WASM 模块。

**请求格式**: `multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| `input_file` | file | 上传文件（对应 config.yaml 中 type=file 的参数） |
| `params` | string (JSON) | 字符串参数（对应 type=string 的参数） |

**响应**:

- 有输出文件 → 返回 `result.zip` 下载（`application/zip`）
- 无输出文件 → 返回 JSON:
  ```json
  { "success": true, "result": "{\"status\":\"ok\",...}" }
  ```
- 执行失败 → 返回 JSON（HTTP 5xx）:
  ```json
  { "error": "错误信息" }
  ```

---

## 适配你的 C++ 项目

### 步骤 1: 替换源码

把你的 C++ 源码放入 `src/`，修改 `Makefile.wasm` 顶部变量：

```makefile
TARGET      = split_compset           # 改成你的模块名
EXPORT_NAME = SplitCompset            # 改成 emcc -s EXPORT_NAME 的值
SOURCES     = split_compset_wasm.cpp  # 改成你的 C++ 入口文件

# 如有依赖库，添加 include 路径和额外源码
INCLUDES    = -I. -Ilib/zstd-1.5.6/lib -Ilib/kiwi-master
EXTRA_SRCS  = lib/zstd-1.5.6/lib/common/xxhash.c ...
```

### 步骤 2: 修改 config.yaml

```yaml
module:
  name: "split_compset"
  wasm_path: "bin/split_compset.js"
  export_name: "SplitCompset"
  entry_function: "splitCompset"

params:
  - name: "input_file"
    type: "file"
    required: true
  - name: "output_dir"
    type: "output_dir"
    required: true
  - name: "publish_file"
    type: "string"
    required: false
    default: ""
```

### 步骤 3: 构建运行

```bash
docker build -t split-compset-api .
docker run -p 5000:5000 split-compset-api
```

**`bridge/runner.js` 和 `api/app.py` 不需要任何修改。**

---

## config.yaml 参数类型说明

| type | 说明 | 请求中的来源 | 传给 WASM 的值 |
|------|------|-------------|---------------|
| `file` | 上传文件 | multipart 文件字段 | work_dir 内的文件绝对路径 |
| `output_dir` | 输出目录 | 自动创建 | work_dir/output 绝对路径 |
| `string` | 字符串 | params JSON | 字符串值 |

参数按 `params` 数组顺序传给 WASM 函数，需与 C++ Embind 函数签名一致。

---

## 本地开发（不用 Docker）

```bash
# 1. 编译 WASM（需要本地安装 emsdk）
cd src && make -f Makefile.wasm

# 2. 安装 Python 依赖
pip install -r api/requirements.txt

# 3. 启动 API
python api/app.py

# 4. 测试
curl -X POST http://localhost:5000/api/execute \
  -F "input_file=@test.txt" \
  -F 'params={"extra_param":"hello"}'
```

---

## 镜像体积

| 阶段 | 基础镜像 | 大小 | 说明 |
|------|---------|------|------|
| Stage 1 (builder) | `emscripten/emsdk:5.0.7` | ~3GB | 编译完丢弃，不进入最终镜像 |
| Stage 2 (runtime) | `node:18-slim` + python3 | ~250MB | 最终镜像 |

最终镜像不含 emcc 工具链，只包含 WASM 产物 + Node.js + Python 运行时。
