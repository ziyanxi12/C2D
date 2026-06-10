# lib-admin-service 接口文档

组件库管理服务，对外暴露在 **3103 端口**，提供组件库拆解、注册、索引管理能力。

---

## 启动

```bash
cd nodejs/lib-admin-service

# 默认配置（需要 LIB_OUT_DIR 目录已存在）
node server.js

# 也可以临时用环境变量覆盖 .env 里的配置（优先级更高）
PORT=3103 LIB_OUT_DIR=/path/to/lib node server.js
```

启动时会先加载同目录下的 `.env`（不存在的变量才会被设置，不会覆盖已有的环境变量），然后检查共享数据目录是否存在。

**配置项**（建议都写进 `.env`，避免每次启动靠记忆手动传环境变量；启动时用环境变量传入的值优先级更高，会覆盖 `.env`）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3103` | 监听端口 |
| `LIB_OUT_DIR` | `/Users/h30072573/lib` | 共享数据目录，组件库数据（`{source}/component/`）和共享索引（`search_index.json`）都存于此 |

> `.env` 已预置好上述所有项。本地启动无需额外配置。

---

## 数据目录说明

共享数据目录 `LIB_OUT_DIR` 结构：

```
/Users/h30072573/lib/
├── search_index.json          # 共享索引（由本服务生成）
├── ict-ui/
│   └── component/
│       ├── component_index.json   # 必须：记录该库所有组件集/独立组件及其 hexFile 路径
│       ├── {componentKey 或 sessionId_localId}.txt
│       └── ...
├── h-design-chart/            # 其他组件库（未来）
│   └── component/
│       ├── component_index.json
│       └── *.txt
└── h-design-light/
```

每条 entry 的 `hexFile` 字段是相对 `LIB_OUT_DIR/{source}/` 的路径，例如 `ict-ui` 的某个组件对应文件实际位于：

```
{LIB_OUT_DIR}/ict-ui/component/9a9da828027b6bdc773731bb333817c0799c208d.txt
```

服务启动时遍历 `search_index.json` 中所有 entry，以 `hexFile` 文件名（去掉扩展名）为 key 建立 `key → 绝对路径` 映射，从而让 `/hex/:key` 无需调用方关心组件来自哪个库。

---

## 新增组件库

新增 `.pix` 组件库的完整操作流程（拆解 → 注册 → 重建索引 → 验证，全程在本服务内通过 `/split`、`/sources`、`/rebuild-index` 完成，无需重启、无需外部脚本）见 [ADDING_LIBRARIES.md](./ADDING_LIBRARIES.md)。

---

## 接口列表

### GET /health

健康检查。

**响应 200：**
```json
{ "status": "ok", "hex_keys": 491 }
```

`hex_keys` 为已加载的 hex key 映射条数。如果 `search_index.json` 不存在，返回 `hex_keys: 0`。

---

### GET /sources

查看当前已注册的组件库列表（即 `sources.json` 内容，决定 `/rebuild-index` 会处理哪些库）。

**响应 200：**
```json
{
  "sources": [
    { "key": "ict-ui", "label": "ICT UI 组件库" }
  ]
}
```

---

### POST /sources

注册一个新组件库（持久化写入 `sources.json`，供 `/rebuild-index` 使用）。这是「[新增组件库全流程](./ADDING_LIBRARIES.md)」的第②步。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `key` | string | 是 | 组件库目录名，须与 `LIB_OUT_DIR/{key}/component/` 实际目录名完全一致；只能包含字母/数字/`-`/`_`，不允许路径分隔符 |
| `label` | string | 是 | 展示用中文名，会出现在匹配结果的 `sourceLabel` 字段里 |

```json
{ "key": "h-design-chart", "label": "H Design 图表库" }
```

**响应 200：** 返回注册后的完整列表
```json
{
  "sources": [
    { "key": "ict-ui", "label": "ICT UI 组件库" },
    { "key": "h-design-chart", "label": "H Design 图表库" }
  ]
}
```

**响应 400 — `key`/`label` 缺失或 `key` 格式不合法：**
```json
{ "error": "key must be a simple directory name (letters/digits/-/_, no path separators), matching the lib-out/ subdirectory" }
{ "error": "label is required" }
```

**响应 409 — `key` 已注册：**
```json
{ "error": "source already registered: ict-ui" }
```

> 仅登记到列表，**不会**触发索引重建——注册后还需调用 `POST /rebuild-index` 才能让新库真正可被 `/hex/:key` 用到。

---

### POST /rebuild-index

基于 `sources.json` 中登记的组件库列表，重新读取各自的 `component_index.json` 并合并生成 `search_index.json`，然后**热重载** `hexPathMap`——全程无需重启服务。这是「[新增组件库全流程](./ADDING_LIBRARIES.md)」的第③步。

**请求体：** 无

**响应 200：**
```json
{
  "entries": 491,
  "sources": [
    { "key": "ict-ui", "label": "ICT UI 组件库", "componentSets": 319, "standaloneComponents": 172 },
    { "key": "h-design-chart", "label": "H Design 图表库", "skipped": true, "reason": "not found: /Users/h30072573/lib/h-design-chart/component/component_index.json" }
  ],
  "hex_keys": 491
}
```

- `entries`/`hex_keys` 为重建后 `search_index.json` 的总条目数与热重载后的 hex key 映射条数
- `sources` 按 `sources.json` 顺序逐一报告每个库贡献的 `componentSets`/`standaloneComponents` 数量
- 找不到 `component_index.json` 的库会标 `skipped: true` 并附 `reason`（不会中断整个重建过程）

**响应 500 — 重建失败**（如 `LIB_OUT_DIR` 不可读）：
```json
{ "error": "..." }
```

> 调用前后对比 `GET /health` 的 `hex_keys`，可确认新库是否成功接入及增量是否符合预期。

---

### POST /split

上传 `.pix` 组件库文件，调用 `split_compset` WASM（编译自 WASM，与 CLI `split_compset build_index` 同源同逻辑）拆解为 `{componentKey 或 sessionId_localId}.txt` + `component_index.json`。

这是「[新增组件库全流程](./ADDING_LIBRARIES.md)」的第①步——**拆解只是第一步，产物要真正可被 `/hex/:key` 用到，还需要继续走完注册 sources → 重新生成索引 → 验证（见 [ADDING_LIBRARIES.md](./ADDING_LIBRARIES.md)）**。

**请求方式：** `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `file` | file | 是 | `.pix` 组件库文件 |
| `publishFile` | string | 否 | 缺少 `componentKey` 时用于补写发布信息（同 CLI `--publish-file`），生成规则：`componentKey = SHA1(publishFile + sessionID:localID)` |
| `source` | string | 否 | 新库的目录名（即 `LIB_OUT_DIR/` 下的 kebab-case 子目录名，只能包含字母/数字/`-`/`_`，不允许路径分隔符）。**传了此字段时跳过 zip 打包，直接把拆解结果写入 `LIB_OUT_DIR/{source}/component/`**，免去手动解压挪动；不传则维持原行为，返回 zip 由调用方自行解压放置 |

**方式 A — 不传 `source`：返回 zip，自行解压放置**

```bash
curl -X POST http://localhost:3103/split \
  -F "file=@library.pix" \
  -F "publishFile=QcO-1WDViGmGQ4IFU_p4FQ"
```

**响应 200：**

```json
{
  "stats": {
    "total": 1,
    "componentSets": 1,
    "standaloneComponents": 0,
    "compDir": "component",
    "indexFile": "component/component_index.json"
  },
  "zip": "UEsDBAoAAAAAAMh..."
}
```

- `stats` 字段含义同 CLI `build_index` 的输出：
  - `total` 为写出的文件总数
  - `componentSets`/`standaloneComponents` 分别是组件集与独立组件数量
  - `compDir`/`indexFile` 是相对 zip 根目录的路径（始终是 `component` / `component/component_index.json`）
- `zip` 是 base64 编码的 zip 文件内容

**zip 包结构**（解压后即可整体放进 `LIB_OUT_DIR/{新库目录名}/`）：

```
component/
├── component_index.json
├── {componentKey 或 sessionId_localId}.txt
└── ...
```

**方式 B — 传 `source`：直接落盘到 `LIB_OUT_DIR/{source}/`，跳过 zip**

```bash
curl -X POST http://localhost:3103/split \
  -F "file=@library.pix" \
  -F "publishFile=QcO-1WDViGmGQ4IFU_p4FQ" \
  -F "source=h-design-new"
```

**响应 200：**

```json
{
  "stats": {
    "total": 1,
    "componentSets": 1,
    "standaloneComponents": 0,
    "compDir": "component",
    "indexFile": "component/component_index.json"
  },
  "savedTo": "h-design-new/component"
}
```

- `savedTo` 是相对 `LIB_OUT_DIR` 的路径，文件已直接写到 `{LIB_OUT_DIR}/h-design-new/component/` 下
- **为避免覆盖已有数据，若该目录已存在会直接返回 500 报错**，需先手动清理或换一个 `source` 名再重试

**响应 400 — 未上传文件 / source 格式错误：**
```json
{ "error": "send a .pix file via -F \"file=@library.pix\"" }
{ "error": "source must be a simple directory name (letters/digits/-/_, no path separators)" }
```

**响应 500 — 拆解失败**（文件不是合法 `.pix`、解析失败、没有可拆出的组件集，或 `source` 目录已存在）：
```json
{ "error": "parse failed: library.pix" }
{ "error": "no component sets found" }
{ "error": "目标目录已存在，为避免覆盖已有数据请先手动清理后重试: h-design-new/component" }
```

> ⚠️ 上传体积限制 200MB（`.pix` 库文件可能较大）；无论哪种方式，本接口只完成"拆解落盘"，**不会**自动更新 `search_index.json`，仍需按 [ADDING_LIBRARIES.md](./ADDING_LIBRARIES.md) 流程继续 `POST /sources` 注册 → `POST /rebuild-index` 重建索引并热重载，避免未经检查就让新数据生效。

---

### GET /hex/:key

跨组件库查找并返回指定 key 对应的 hex 文件内容（供其他服务调用）。

**路径参数：** `key` —
- 40 位小写 hex 字符串（旧版 SHA1 componentKey，如 `ict-ui` 库）
- 或 `{sessionId}_{localId}` 格式（新版 guid 派生，如 `h-design-chart`、`h-design-light` 库）

**响应 200：** `Content-Type: text/plain`，hex 文件原始内容

**响应 404 — key 格式合法但未收录或文件缺失：**
```json
{ "error": "component not found: 0000000000000000000000000000000000000000" }
```

**响应 400 — key 格式不合法：**
```json
{ "error": "key must be a 40-char lowercase hex string or {sessionId}_{localId}" }
```

---

### GET /get-index

返回 `search_index.json` 内容（供 **dsl-match-service** 使用）。

**响应 200：**
```json
{
  "entries": [
    {
      "name": "文字链接",
      "source": "ict-ui",
      "sourceLabel": "ICT UI 组件库",
      "componentKey": "be1d28168c521684a3d888b60f9e8a645653b4b7",
      "hexFile": "component/be1d28168c521684a3d888b60f9e8a645653b4b7.txt",
      "variants": [...],
      "searchText": "..."
    }
  ]
}
```

**响应 404 — 索引文件不存在：**
```json
{ "error": "search_index.json not found" }
```

> 本接口供 dsl-match-service 获取索引数据，一般不直接调用。索引更新后 dsl-match-service 手动重启（TODO：自动监听机制）。

---

## 核心能力一览

| 能力 | 接口 | 说明 |
|---|---|---|
| 组件库拆解 | `/split` | 上传 `.pix` 直接拆解（基于 WASM），可选直接落盘到 `LIB_OUT_DIR/{source}/` |
| 组件库管理 | `/sources`、`/rebuild-index` | 注册新组件库、重建索引并热重载——见 [ADDING_LIBRARIES.md](./ADDING_LIBRARIES.md) |
| hex 获取 | `/hex/:key` | 跨组件库统一查找，调用方无需关心组件来自哪个库 |
| 索引获取 | `/get-index` | 返回共享索引，供 dsl-match-service 使用 |

---

## 架构说明

本服务与 **dsl-match-service**（端口 3102）共享数据目录 `LIB_OUT_DIR`：

- **本服务职责**：
  - 拆解 .pix 文件：`POST /split`
  - 注册组件库：`POST /sources`
  - 生成和维护 `search_index.json`：`POST /rebuild-index`
  - 提供 hex 文件：`GET /hex/:key`

- **dsl-match-service 职责**：
  - 只读 `search_index.json` 进行语义匹配
  - 不负责索引生成和维护
  - 索引更新后需手动重启（TODO：自动监听机制）

- **使用方服务获取 hex 内容**：
  - 直接读本地文件：`HEX_LIB_DIR + matchResult.path`
  - 不再调用本服务的 `/hex/:key` 接口

---

## 调用示例

### 新增组件库完整流程

```bash
# 1. 拆解 .pix 文件（传 source 直接落盘）
curl -X POST http://localhost:3103/split \
  -F "file=@library.pix" \
  -F "source=h-design-chart"

# 2. 注册新库
curl -X POST http://localhost:3103/sources \
  -H "Content-Type: application/json" \
  -d '{ "key": "h-design-chart", "label": "H Design 图表库" }'

# 3. 重建索引
curl -X POST http://localhost:3103/rebuild-index

# 4. 验证
curl http://localhost:3103/health
```

### 获取 hex 文件

```bash
# 用 componentKey 或 hexFile 文件名获取 hex 内容
curl http://localhost:3103/hex/9a9da828027b6bdc773731bb333817c0799c208d
```

---

## TODO

- [ ] 自动监听索引变更机制（通知 dsl-match-service 重新加载）
- [ ] 删除已注册的组件库（`DELETE /sources/:key`）
- [ ] 更新已有组件库的流程文档