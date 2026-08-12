# split-compset-api Docker 使用指南

> 本文档详细介绍 `split-compset-api` Docker 镜像的功能、构建方式、运行命令、API 接口及内部架构。
>
> 源码目录：`/Users/h30072573/nodejs/wasm-api-template/`
> 镜像 tar：`/Users/h30072573/nodejs/split-compset-api.tar`

---

## 目录

- [1. 概述](#1-概述)
- [2. Docker 镜像操作命令](#2-docker-镜像操作命令)
- [3. 镜像功能详解](#3-镜像功能详解)
- [4. API 接口文档](#4-api-接口文档)
- [5. 容器内部结构](#5-容器内部结构)
- [6. 架构与数据流](#6-架构与数据流)
- [7. 构建过程说明](#7-构建过程说明)
- [8. 配置说明](#8-配置说明)
- [9. 常见问题](#9-常见问题)

---

## 1. 概述

`split-compset-api` 是一个 **Pixso 组件库拆解服务**。它接收 Pixso 设计工具导出的 `.pix` 组件库文件，将其中的组件集（Component Sets）和独立组件（Standalone Components）逐一拆解为独立的 `.hex`（hex 编码的 Pixso 二进制数据）文件，并生成一份 `component_index.json` 索引文件。

### 技术栈

| 层 | 技术 | 作用 |
|---|---|---|
| HTTP 服务 | Python / Flask / Gunicorn | 接收文件上传、调度执行、返回结果 |
| 桥接层 | Node.js | 加载 WASM 模块、构造参数、收集输出 |
| 核心逻辑 | C++ / Emscripten → WebAssembly | 解析 .pix、拆解组件、编码输出 |

### 镜像信息

| 项 | 值 |
|---|---|
| 镜像名称 | `split-compset-api:latest` |
| 完整引用 | `docker.io/library/split-compset-api:latest` |
| 架构 / OS | amd64 / linux |
| 基镜像 | `python:3.11-slim`（Debian Trixie） |
| 创建时间 | 2026-07-22 03:05:18 UTC |
| 暴露端口 | 5000/tcp |
| 启动命令 | `gunicorn -w 2 -b 0.0.0.0:5000 --timeout 600 api.app:app` |
| 镜像大小 | ~90MB（tar 文件 89.6MB） |

---

## 2. Docker 镜像操作命令

### 2.1 从 tar 文件载入镜像

已有 `docker save` 导出的 tar 文件时，直接载入：

```bash
docker load -i /Users/h30072573/nodejs/split-compset-api.tar
```

载入后镜像名为 `split-compset-api:latest`，可通过 `docker images` 确认：

```bash
docker images | grep split-compset
# 输出：
# split-compset-api   latest   <image-id>   90MB   2026-07-22
```

### 2.2 从源码构建镜像

在 `wasm-api-template/` 目录下执行（需要本地已安装 Docker）：

```bash
cd /Users/h30072573/nodejs/wasm-api-template
docker build -t split-compset-api:latest .
```

构建过程为多阶段构建（详见 [第 7 节](#7-构建过程说明)），Stage 1 使用 `emscripten/emsdk` 编译 C++ 为 WASM，Stage 2 基于 `python:3.11-slim` 打包运行时。

### 2.3 运行容器

```bash
docker run -d \
  --name split-compset-api \
  -p 5000:5000 \
  --restart unless-stopped \
  split-compset-api:latest
```

| 参数 | 说明 |
|------|------|
| `-d` | 后台运行 |
| `--name split-compset-api` | 容器名称，便于后续引用 |
| `-p 5000:5000` | 宿主机 5000 端口映射到容器 5000 端口 |
| `--restart unless-stopped` | 容器异常退出自动重启（手动 stop 除外） |

启动后访问 `http://localhost:5000/health` 验证服务是否正常。

### 2.4 查看日志

```bash
# 查看全部日志
docker logs split-compset-api

# 实时跟踪日志
docker logs -f split-compset-api

# 查看最近 50 行
docker logs --tail 50 split-compset-api
```

### 2.5 停止与删除

```bash
# 停止容器
docker stop split-compset-api

# 删除容器
docker rm split-compset-api

# 删除镜像
docker rmi split-compset-api:latest
```

### 2.6 进入容器调试

```bash
docker exec -it split-compset-api bash
```

容器内可检查的路径：

```bash
ls /app
# bin/  bridge/  api/  config.yaml  package.json
```

### 2.7 导出镜像为 tar

```bash
docker save -o split-compset-api.tar split-compset-api:latest
```

---

## 3. 镜像功能详解

### 3.1 核心功能：Pixso 组件库拆解

Pixso 的 `.pix` 文件是一个**组件库**，内部包含多个组件集和独立组件，全部序列化在一棵节点树中。本服务将其**拆解为独立的组件文件**，每个文件可单独导入 Pixso。

### 3.2 输入

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pix_file` | file | 是 | Pixso `.pix` 组件库文件 |
| `output_dir` | output_dir | 自动 | 由框架创建，WASM 写入输出文件 |
| `publish_file` | string | 否 | 缺少 `componentKey` 时用于补写发布信息 |
| `domain` | string | 否 | 组件库领域标识，写入索引顶层字段 |

### 3.3 .pix 文件格式

`.pix` 文件不是普通二进制，其格式为：

```
[8 字节魔数 "pixso-kw"]
[2 字节版本/标志]
[1 字节元数据长度]
[元数据字符串 "compress:zstd"]
[zstd 压缩的 kiwi 二进制数据]
```

其中 kiwi 是 Pixso 内部使用的二进制序列化框架（基于 [Evan Wallace 的 kiwi schema](https://github.com/evanw/kiwi)），压缩算法为 zstd。

### 3.4 处理流程

WASM 导出函数 `splitCompset(pixPath, outDir, publishFile, domain)` 的处理分为 5 个阶段：

#### 阶段 1：解压与解码

```
readFile(pixPath)
  → decompressPix()     // 校验魔数 "pixso-kw"，zstd 解压
  → kiwi::ByteBuffer
  → PixsoMsg.decode()   // kiwi 反序列化，得到 PixsoNode 数组
```

#### 阶段 2：建立全量索引 (`buildIndex`)

遍历所有 `PixsoNode`，构建：

- `byGuid`：guid → NodeRec 映射（guid 由 sessionID + localID 组成）
- `children`：parent guid → [子 guid] 列表（按 position 排序）
- `styleByKey`：styleKey → guid（样式主节点索引）

每个 `NodeRec` 记录节点的：guid、父 guid、类型（DOCUMENT/CANVAS/FRAME/SYMBOL/INSTANCE/TEXT 等）、名称、symbolID（INSTANCE 引用的 SYMBOL）、componentKey、isStateGroup（是否组件集）、尺寸、样式引用等。

#### 阶段 3：拆解组件库 (`splitLibrary`)

遍历所有 CANVAS（跳过 `internalOnly` 隐藏页），对每个 CANVAS 下的子节点：

- **SECTION (type=104)**：递归进入
- **SYMBOL (type=16)**：独立组件，打包为一个 CompSet
- **FRAME + isStateGroup (type=5)**：组件集，打包为一个 CompSet

对每个 CompSet 调用 `collectSubtree` 收集完整节点集合：

1. **BFS 收集子树**：从根节点出发，收集所有子孙节点
2. **INSTANCE 跨引用追踪**：遇到 INSTANCE 节点时，通过 `symbolData.symbolID` 找到被引用的 SYMBOL，将该 SYMBOL 的子树也加入（若该 SYMBOL 属于另一个组件集，则拉入整个组件集的所有变体）
3. **样式引用追踪**：通过 `inheritFillStyleID` / `inheritFillStyleIDForBackground` / `inheritFillStyleIDForStroke` 找到样式定义节点，也加入集合
4. **symbolOverrides / derivedSymbolData 递归**：深入 INSTANCE 的覆盖数据中继续追踪样式引用

收集完成后，对每个组件集提取变体信息：

- 组件集（isStateGroup）：遍历直接 SYMBOL 子节点作为变体，通过父 FRAME 的 `componentPropDef` 和变体的 `parentPropDefId` 映射出属性名/类型
- 独立 SYMBOL：直接从自身 `componentPropDef` 获取属性
- 属性类型：BOOL / TEXT / COLOR / INSTANCE_SWAP（只收集 VISIBLE / TEXT_DATA / OVERRIDDEN_SYMBOL_ID 三种字段引用）

最后调用 `encodeNodes` 将收集的节点重新编码为独立的 `PixsoMsg`：

- 前 2 个槽放 CANVAS 节点：`{0,1}` 为主页面（组件根挂这里），`{0,2}` 为隐藏页（外部引用的组件/样式挂这里）
- 孤根节点重挂：主根 → `{0,1}`，其余孤根 → `{0,2}`
- 收集所有 `blobIndex` 引用（fillGeometry / strokeGeometry / vectorNetworkBlob / glyphs 等），从原始库的 blobs 数组提取数据，建立本地重映射表，写入独立 blobs
- 编码后通过 `compressToPix` 重新压缩为 `.pix` 格式

#### 阶段 4：可选补写 componentKey (`patchPublishInfo`)

当传入 `publishFile` 且某些 SYMBOL / 组件集节点缺少 `componentKey` 时：

```
componentKey = SHA1(publishFile + sessionID + ":" + localID)
publishFile  = 传入的 publishFile
publishID    = 节点自身 GUID
```

#### 阶段 5：落盘 (`dumpCompSets`)

在 `outDir/component/` 目录下：

- 每个组件 → `{componentKey 或 guid}.txt`：内容为 `<!-- pixso binary data -->\n` + hex 编码的 .pix 数据
- 额外生成 `component_index.json` 索引文件（结构见下文）

### 3.5 输出

服务返回一个 **zip 文件**（`result.zip`），包含：

```
component/
├── {componentKey1}.txt          # 组件集 1 的 hex 数据
├── {componentKey2}.txt          # 组件集 2 的 hex 数据
├── ...
├── {componentKeyN}.txt          # 独立组件 N 的 hex 数据
└── component_index.json         # 全量索引
```

### 3.6 component_index.json 结构

```jsonc
{
  "domain": "可选的领域标识",
  "componentSets": [
    {
      "name": "按钮/主按钮",
      "guid": "123:456",
      "componentKey": "abc123...",
      "canvasName": "组件页面",
      "hexFile": "component/abc123....txt",
      "variants": [
        {
          "name": "状态=默认",
          "guid": "123:457",
          "variantKey": "def456...",
          "parentKey": "abc123...",
          "componentProps": [
            { "name": "状态", "type": "TEXT" },
            { "name": "尺寸", "type": "BOOL" }
          ]
        }
      ]
    }
  ],
  "standaloneComponents": [
    {
      "name": "图标/搜索",
      "guid": "123:789",
      "componentKey": "ghi789...",
      "canvasName": "图标页面",
      "hexFile": "component/ghi789....txt",
      "componentProps": [
        { "name": "颜色", "type": "COLOR" }
      ]
    }
  ]
}
```

---

## 4. API 接口文档

### 4.1 `GET /health`

健康检查。

**响应**：

```json
{
  "status": "ok",
  "module": "split_compset"
}
```

**示例**：

```bash
curl http://localhost:5000/health
```

### 4.2 `GET /api/info`

返回模块信息和参数定义。

**响应**：

```json
{
  "module": "split_compset",
  "entry_function": "splitCompset",
  "params": [
    { "name": "pix_file", "type": "file", "required": true },
    { "name": "output_dir", "type": "output_dir", "required": true },
    { "name": "publish_file", "type": "string", "required": false, "default": "" },
    { "name": "domain", "type": "string", "required": false, "default": "" }
  ]
}
```

**示例**：

```bash
curl http://localhost:5000/api/info
```

### 4.3 `POST /api/execute`

执行组件库拆解。

**请求格式**：`multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pix_file` | file | 是 | 上传的 `.pix` 组件库文件 |
| `params` | string (JSON) | 否 | JSON 格式的字符串参数 |

`params` JSON 可包含的字段：

```json
{
  "publish_file": "publish_xxx",
  "domain": "design-system"
}
```

| 参数名 | 类型 | 必填 | 默认 | 说明 |
|--------|------|------|------|------|
| `publish_file` | string | 否 | `""` | 补写 componentKey 用 |
| `domain` | string | 否 | `""` | 写入索引顶层 domain 字段 |

**响应**：

- **成功（有输出文件）**：返回 `result.zip` 文件下载（`application/zip`），内含 `component/*.txt` + `component_index.json`
- **成功（无输出文件）**：返回 JSON：
  ```json
  {
    "success": true,
    "result": "{\"total\":12,\"componentSets\":8,\"standaloneComponents\":4,...}"
  }
  ```
- **参数错误**：HTTP 400
  ```json
  { "error": "missing required file: pix_file" }
  ```
- **执行失败**：HTTP 500
  ```json
  {
    "error": "runner.js exited with non-zero code",
    "stderr": "...",
    "stdout": "..."
  }
  ```
- **超时**：HTTP 504
  ```json
  { "error": "execution timeout (600s)" }
  ```

**完整调用示例**：

```bash
# 基本调用（仅上传 .pix 文件）
curl -X POST http://localhost:5000/api/execute \
  -F "pix_file=@/path/to/component-library.pix" \
  -o result.zip

# 带可选参数
curl -X POST http://localhost:5000/api/execute \
  -F "pix_file=@/path/to/component-library.pix" \
  -F 'params={"publish_file":"pub_20260722","domain":"design-system"}' \
  -o result.zip

# 解压查看结果
unzip result.zip -d output/
ls output/component/
# {componentKey1}.txt  {componentKey2}.txt  ...  component_index.json

# 查看索引
cat output/component/component_index.json | python3 -m json.tool
```

---

## 5. 容器内部结构

### 5.1 文件布局

```
/app/                          # WorkingDir
├── bin/
│   ├── split_compset.js       # Emscripten 生成的 JS 胶水代码
│   └── split_compset.wasm     # 编译后的 WASM 二进制（被 .js 加载）
├── bridge/
│   └── runner.js              # Node.js 桥接层（零依赖）
├── api/
│   ├── app.py                 # Flask WSGI 应用
│   └── requirements.txt       # Python 依赖声明
├── config.yaml                # 模块配置（启动时读取一次）
└── package.json               # Node.js 项目声明（零依赖）
```

### 5.2 运行时环境

| 组件 | 版本 | 说明 |
|------|------|------|
| Python | 3.11.15 | 基镜像 python:3.11-slim 内置 |
| Node.js | 18.x | 通过 NodeSource 仓库安装 |
| Gunicorn | >= 21.2.0 | WSGI 服务器，2 worker |
| Flask | >= 3.0.0 | Web 框架 |
| PyYAML | >= 6.0 | 配置文件解析 |

### 5.3 启动命令详解

```bash
gunicorn -w 2 -b 0.0.0.0:5000 --timeout 600 api.app:app
```

| 参数 | 值 | 说明 |
|------|---|------|
| `-w` | 2 | 2 个 worker 进程 |
| `-b` | `0.0.0.0:5000` | 绑定所有网卡的 5000 端口 |
| `--timeout` | 600 | worker 超时 600 秒（与 config.yaml 的 timeout_sec 对齐） |
| `api.app:app` | | Python 模块路径：`api/app.py` 文件中的 `app` 变量 |

---

## 6. 架构与数据流

### 6.1 整体架构图

```
外部调用方 (curl / 应用)
    │
    │  POST /api/execute
    │  multipart: pix_file + params JSON
    ▼
┌─ Flask API (api/app.py, gunicorn) ───────────────────────────┐
│                                                              │
│  1. 解析请求参数（pix_file 文件 + publish_file/domain 字符串）  │
│  2. 创建临时工作目录 work_dir/                                 │
│  3. 保存上传的 .pix 文件到 work_dir/                           │
│  4. 写 config.json（模块配置 + 参数值）                        │
│  5. spawn 子进程:                                             │
│       node bridge/runner.js <work_dir>                       │
│  6. 等待子进程结束（超时 600s）                                 │
│  7. 解析 stdout 最后一行 JSON                                  │
│  8. 有输出文件 → 打包 zip 返回下载                              │
│     无输出文件 → 返回 JSON                                     │
│  9. 清理临时目录                                               │
│                                                              │
└──────────────────┬───────────────────────────────────────────┘
                   │ subprocess (Node.js)
                   ▼
┌─ Node.js Bridge (bridge/runner.js) ──────────────────────────┐
│                                                              │
│  1. 读取 work_dir/config.json                                │
│  2. require(wasm_path)() 异步加载 WASM 模块                   │
│  3. 按 params 定义构造调用参数：                               │
│       file      → work_dir 内文件绝对路径                     │
│       output_dir → work_dir/output 绝对路径                   │
│       string    → 从 param_values 取值                       │
│  4. mod.splitCompset(pixPath, outDir, publishFile, domain)   │
│  5. 扫描 output/ 目录收集输出文件列表                          │
│  6. stdout 输出 JSON 结果                                     │
│                                                              │
└──────────────────┬───────────────────────────────────────────┘
                   │ WASM 调用 (NODERAWFS=1)
                   ▼
┌─ C++ WASM (bin/split_compset.wasm) ──────────────────────────┐
│                                                              │
│  splitCompset(pixPath, outDir, publishFile, domain)          │
│                                                              │
│  1. readFile(pixPath)        — 直接读文件 (NODERAWFS)        │
│  2. decompressPix()          — zstd 解压                     │
│  3. PixsoMsg.decode()        — kiwi 反序列化                 │
│  4. buildIndex()             — 建全量节点索引                 │
│  5. patchPublishInfo()       — 可选补写 componentKey          │
│  6. splitLibrary()           — 拆解组件集/独立组件            │
│     ├─ collectSubtree()      — 收集完整节点集合               │
│     │  ├─ INSTANCE → SYMBOL 跨引用追踪                       │
│     │  └─ inheritFillStyleID 样式引用追踪                    │
│     ├─ encodeNodes()         — 重新编码为独立 PixsoMsg        │
│     │  ├─ 孤根重挂到 CANVAS {0,1} / {0,2}                   │
│     │  ├─ blobIndex 重映射（提取 + 恢复）                    │
│     │  └─ compressToPix()   — zstd 压缩为 .pix              │
│     └─ 提取变体 componentProps                               │
│  7. dumpCompSets()           — 写出 .txt(hex) + index.json   │
│  8. 返回 JSON 统计字符串                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 关键设计：NODERAWFS

WASM 编译时启用了 `NODERAWFS=1`，使得 C++ 的 `fopen` / `fread` / `fwrite` / `mkdir` 等 POSIX 文件操作**直接路由到 Node.js 的 `fs` 模块**。

这意味着：
- 无需将文件内容序列化传入 WASM 内存
- WASM 可直接读写宿主文件系统（限定在 work_dir 范围内）
- 大文件（数百 MB）也能高效处理，不受 WASM 32 位地址空间限制

### 6.3 关键设计：blobIndex 重映射与恢复

原始组件库中所有矢量路径、文字字形等二进制数据存在一个共享的 `blobs` 数组中，节点通过 `blobIndex` 引用。拆解时：

1. 扫描组件所有节点的 `blobIndex` 引用
2. 从原始库 `blobs` 数组提取被引用的数据
3. 建立重映射表（old index → new local 0-based index）
4. 写入独立 blobs 数组
5. 修改节点中的 `blobIndex` 指向本地索引
6. **编码完成后立即恢复原始 `blobIndex` 值**（因为节点是浅拷贝，指向共享的 `li.pool`，不恢复会污染后续组件的收集）

---

## 7. 构建过程说明

### 7.1 Dockerfile 多阶段构建

```dockerfile
# ─────────────────────────────────────────────
# Stage 1: emcc 编译 C++ → WASM
# ─────────────────────────────────────────────
FROM emscripten/emsdk:5.0.7 AS builder

WORKDIR /build/src
COPY src/ ./

RUN make -f Makefile.wasm EMCC=emcc

# ─────────────────────────────────────────────
# Stage 2: 运行时（Python + Node.js）
# ─────────────────────────────────────────────
FROM python:3.11-slim

# 换阿里云镜像源 + 安装 Node.js 18
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null; \
    apt-get update && \
    apt-get install -y --no-install-recommends curl zip ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 拷贝 WASM 编译产物
COPY --from=builder /build/src/bin/ ./bin/

# 拷贝桥接层、API 服务、配置
COPY bridge/       ./bridge/
COPY api/          ./api/
COPY config.yaml   .
COPY package.json  .

# 安装 Python 依赖（换阿里云 PyPI）
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ \
    -r api/requirements.txt

EXPOSE 5000

CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "--timeout", "600", "api.app:app"]
```

### 7.2 Stage 1：WASM 编译

| 项 | 说明 |
|---|---|
| 基镜像 | `emscripten/emsdk:5.0.7` |
| 工作目录 | `/build/src` |
| 编译命令 | `make -f Makefile.wasm EMCC=emcc` |
| 源码 | `src/` 目录下全部文件（含 `lib/` 第三方库） |
| 产物 | `/build/src/bin/split_compset.js` + `split_compset.wasm` |
| 丢弃 | 编译完后 Stage 1 整个丢弃，不进入最终镜像 |

### 7.3 Stage 2：运行时打包

| 项 | 说明 |
|---|---|
| 基镜像 | `python:3.11-slim`（Debian Trixie + Python 3.11.15） |
| 额外安装 | Node.js 18（NodeSource）、curl、zip、ca-certificates |
| 工作目录 | `/app` |
| 拷贝内容 | `bin/`（WASM 产物）、`bridge/`、`api/`、`config.yaml`、`package.json` |
| Python 依赖 | flask>=3.0.0、pyyaml>=6.0、gunicorn>=21.2.0 |

### 7.4 源码依赖库

| 库 | 路径 | 用途 |
|---|---|---|
| kiwi | `src/lib/kiwi-master/` | 二进制序列化框架（Pixso 节点数据的编码/解码） |
| zstd | `src/lib/zstd-1.5.6/` | Zstandard 压缩算法（.pix 文件的压缩/解压） |
| pixso.h | `src/lib/pixso.h` | Pixso kiwi schema 定义（PixsoMsg / PixsoNode 等结构） |

### 7.5 .dockerignore

```
node_modules
.git
*.md
src/bin
api/__pycache__
api/*.pyc
.env
```

注意：`*.md` 被忽略，所以本文档不会进入镜像。`src/bin` 被忽略，因为 bin/ 由 Stage 1 编译生成。

---

## 8. 配置说明

### 8.1 config.yaml 完整配置

```yaml
# WASM 模块配置 — split_compset
module:
  name: "split_compset"            # 模块名称（/health 和 /api/info 返回）
  wasm_path: "bin/split_compset.js" # WASM JS 胶水文件路径（相对 /app）
  export_name: "SplitCompset"      # Emscripten EXPORT_NAME
  entry_function: "splitCompset"   # WASM 导出的函数名

# API 配置
api:
  port: 5000                       # 服务端口（与 Dockerfile EXPOSE / gunicorn -b 对齐）
  max_content_length_mb: 500       # 上传文件大小上限（500MB）
  timeout_sec: 600                 # 执行超时（与 gunicorn --timeout 对齐）

# 执行参数定义
# splitCompset(pixPath, outDir, publishFile, domain)
params:
  - name: "pix_file"
    type: "file"                   # 上传文件，传给 WASM 的是 work_dir 内绝对路径
    required: true

  - name: "output_dir"
    type: "output_dir"             # 输出目录，自动创建，传给 WASM 的是 work_dir/output 绝对路径
    required: true

  - name: "publish_file"
    type: "string"                 # 字符串参数，从请求 params JSON 中取值
    required: false
    default: ""

  - name: "domain"
    type: "string"
    required: false
    default: ""
```

### 8.2 参数类型说明

| type | 说明 | 请求中的来源 | 传给 WASM 的值 |
|------|------|-------------|---------------|
| `file` | 上传文件 | multipart 文件字段 | work_dir 内的文件绝对路径 |
| `output_dir` | 输出目录 | 框架自动创建 | work_dir/output 绝对路径 |
| `string` | 字符串 | params JSON 对应字段 | 字符串值（或 default） |

参数按 `params` 数组顺序传给 WASM 函数，需与 C++ Embind 函数签名一致。

### 8.3 换项目时需修改的文件

| 文件 | 修改内容 |
|------|---------|
| `src/` | 替换 C++ 源码 |
| `src/Makefile.wasm` | 修改 TARGET / EXPORT_NAME / SOURCES / INCLUDES |
| `config.yaml` | 修改 module 段和 params 段 |
| `bridge/runner.js` | **无需修改**（通用） |
| `api/app.py` | **无需修改**（通用） |

---

## 9. 常见问题

### Q1: 如何从 tar 载入镜像？

```bash
docker load -i /Users/h30072573/nodejs/split-compset-api.tar
```

载入后镜像名为 `split-compset-api:latest`。

### Q2: 端口 5000 被占用怎么办？

映射到其他宿主机端口：

```bash
docker run -d --name split-compset-api -p 8080:5000 split-compset-api:latest
# 然后访问 http://localhost:8080
```

### Q3: 上传大文件失败？

`config.yaml` 中 `max_content_length_mb: 500`，即最大 500MB。如需更大，修改 config.yaml 后重新构建镜像。同时 Gunicorn 的 `--timeout 600` 也需相应加大。

### Q4: 执行超时？

默认超时 600 秒（10 分钟）。超时返回 HTTP 504。如需更长超时，修改 `config.yaml` 的 `timeout_sec` 和 Dockerfile 中 gunicorn 的 `--timeout`，保持两者一致。

### Q5: 如何查看 WASM 执行的详细日志？

WASM 内部使用 `fprintf(stderr, ...)` 和 `printf(...)` 输出调试信息。这些会出现在 `runner.js` 的 stderr/stdout 中，进而出现在 Flask 的 `subprocess.run` 结果里。执行失败时 API 响应会包含 `stderr` 和 `stdout` 字段。

成功执行时，WASM 的 `printf` 输出（如每个组件的写入日志）会出现在 `stdout` 中，但 API 只取最后一行 JSON，前面的日志被丢弃。如需查看完整日志：

```bash
docker exec -it split-compset-api bash
# 手动调用 runner.js
cd /app
mkdir -p /tmp/work/output
# 准备 config.json 和 .pix 文件后：
node bridge/runner.js /tmp/work
```

### Q6: 镜像支持 ARM 架构（Apple Silicon）吗？

当前镜像架构为 `amd64`。在 Apple Silicon（M1/M2/M3）上运行时 Docker 会通过 Rosetta 2 模拟，可能有性能损耗。如需原生 ARM 镜像，需在 ARM 机器上重新 `docker build`。

### Q7: 如何换自己的 C++ 项目？

1. 将 C++ 源码放入 `src/`
2. 修改 `src/Makefile.wasm` 的 TARGET / EXPORT_NAME / SOURCES
3. 修改 `config.yaml` 的 module 段和 params 段
4. `docker build -t my-api .`
5. `bridge/runner.js` 和 `api/app.py` 无需任何修改

### Q8: .pix 文件解析失败怎么办？

可能原因：
- 文件不是 Pixso 导出的 `.pix` 格式（魔数不是 `pixso-kw`）
- 文件损坏或被截断
- zstd 解压失败

API 返回的 `error` 字段会提示具体原因（`cannot open: ...` / `parse failed: ...` / `decompress failed`）。

### Q9: component_index.json 中 componentKey 为空？

当 `.pix` 文件中的节点本身没有 `componentKey` 且未传入 `publish_file` 参数时，`componentKey` 为空，此时文件名使用 `sessionID_localID` 格式。传入 `publish_file` 参数后，会通过 `SHA1(publishFile + guid)` 生成 componentKey。
