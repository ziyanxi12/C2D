# dsl-match-service 接口文档

DSL 匹配服务，对外暴露在 **3102 端口**，提供基于 LLM 的语义化组件匹配能力。

---

## 启动

```bash
cd nodejs/dsl-match-service

# 默认配置（需要 search_index.json 已存在）
node server.js

# 也可以临时用环境变量覆盖 .env 里的配置（优先级更高）
PORT=3102 SEARCH_INDEX_PATH=/path/to/search_index.json node server.js
```

启动时会先加载同目录下的 `.env`（不存在的变量才会被设置，不会覆盖已有的环境变量），然后检查共享索引文件是否存在。

**配置项**（建议都写进 `.env`，避免每次启动靠记忆手动传环境变量；启动时用环境变量传入的值优先级更高，会覆盖 `.env`）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3102` | 监听端口 |
| `DASHSCOPE_API_KEY` | — | LLM 调用密钥（必填），`/match`、`/batch`、`/match-dsl`、`/match-dsl-single` 依赖 |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | LLM 接口地址 |
| `MODEL` | `deepseek-v4-flash` | LLM 模型名，可改为 `deepseek-v4-pro` |
| `LLM_TIMEOUT_MS` | `60000` | 单次 LLM 请求超时（毫秒）。排查 `/match` 报 `timeout` 时可调大此值 |
| `SEARCH_INDEX_PATH` | `/Users/h30072573/lib/search_index.json` | 共享索引文件路径（由 **lib-admin-service** 生成） |

> `.env` 已预置好上述所有项（`SEARCH_INDEX_PATH` 已配置为共享数据目录）。本地启动无需额外配置。

---

## 数据来源

本服务依赖 `search_index.json`（共享数据），由 **lib-admin-service**（端口 3103）生成和维护。

`search_index.json` 结构：

```json
{
  "entries": [
    {
      "name": "文字链接",
      "source": "ict-ui",
      "sourceLabel": "ICT UI 组件库",
      "componentKey": "be1d28168c521684a3d888b60f9e8a645653b4b7",
      "hexFile": "component/be1d28168c521684a3d888b60f9e8a645653b4b7.txt",
      "variants": [
        {
          "name": "status=independent, Interaction=default, size=normal, disabled=false",
          "variantKey": "f88483c3510885a0ff9c365f3e6f1d06375b530a",
          "guid": "8229:277395",
          "parentKey": "be1d28168c521684a3d888b60f9e8a645653b4b7"
        }
      ],
      "searchText": "文字链接 ICT UI 组件库 status=independent Interaction default size normal disabled false ..."
    }
  ]
}
```

每条 entry 包含：
- `name` - 组件集名称
- `source` / `sourceLabel` - 组件库标识和展示名
- `componentKey` - 组件集唯一标识
- `hexFile` - hex 文件相对路径
- `variants` - 变体列表（包含 name、variantKey、guid）
- `searchText` - 用于本地过滤的搜索文本

---

## 接口列表

### GET /health

健康检查。

**响应 200：**
```json
{ "status": "ok", "index_exists": true }
```

`index_exists` 表示共享索引文件是否存在。如果不存在，返回 `index_exists: false`。

---

### POST /match

单条组件变体语义匹配（LLM 驱动）。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `description` | string | 是 | 组件描述，支持自然语言或结构化描述，长度限制 200 字符 |

```json
{ "description": "主按钮大号" }
```

**响应 200：**

```json
{
  "source": "ict-ui",
  "sourceLabel": "ICT UI 组件库",
  "componentSetName": "1.按钮",
  "componentKey": "9a9da828027b6bdc773731bb333817c0799c208d",
  "hexFile": "component/9a9da828027b6bdc773731bb333817c0799c208d.txt",
  "path": "ict-ui/component/9a9da828027b6bdc773731bb333817c0799c208d.txt",
  "variant": {
    "name": "status=primary, Interaction=default, size=large, disabled=false",
    "variantKey": "7f599a2db9d8ac901cf4c858825d1e04221d3021",
    "guid": "4280:102987"
  },
  "reason": "该变体为 status=primary（主按钮）、size=large（大号），且为默认交互状态，与"主按钮大号"完全匹配。",
  "fallback": false
}
```

**响应字段说明：**

| 字段 | 说明 |
|---|---|
| `source` | 组件库 key（如 `ict-ui`） |
| `sourceLabel` | 组件库展示名（如 `ICT UI 组件库`） |
| `componentSetName` | 组件集名称（如 `1.按钮`） |
| `componentKey` | 组件集唯一标识（40 位 SHA1 或 `{sessionId}_{localId}`） |
| `hexFile` | hex 文件相对路径（如 `component/xxx.txt`） |
| `path` | **重要**：相对共享数据目录的完整路径（如 `ict-ui/component/xxx.txt`），使用方服务可直接拼接 `HEX_LIB_DIR + path` 读取 hex 文件 |
| `variant.name` | 变体属性描述（如 `status=primary, size=large`） |
| `variant.variantKey` | 变体唯一标识 |
| `variant.guid` | 变体 guid（Figma 节点 ID） |
| `reason` | 匹配原因说明（LLM 解释为何选择此变体） |
| `fallback` | 是否为算法兜底（LLM 未返回有效结果时使用本地算法匹配） |

**响应 400 — description 缺失或格式错误：**
```json
{ "error": "description is required" }
{ "error": "description must be a string" }
{ "error": "description too long (max 200 chars) — pass a short natural-language description, not a serialized object" }
{ "error": "description must be a short natural-language text, not a serialized JSON object/array — extract a field like label/name first" }
```

**响应 404 — 未找到匹配：**
```json
{ "error": "no match found" }
```

**响应 500 — LLM 调用失败或超时：**
```json
{ "error": "Request timed out." }
{ "error": "Connection error." }
{ "error": "..." }
```

> 实测单条匹配耗时约 5~6 秒（内部最多 3 次 LLM 调用：语义提取 → 选组件集 → 精选变体）。

> ⚠️ `description` 应为简短自然语言描述（如"主按钮大号"），不能是序列化的 JSON 对象/数组——后者会被逐字嵌入多次 LLM 调用的 prompt，既无法被正确语义匹配，又徒增数倍 token 消耗。

---

### POST /batch

批量组件变体匹配，最多 100 条，内部 5 并发执行。

**请求体（两种格式均可）：**

**格式 A — 数组包裹：**
```json
{ "descriptions": ["主按钮大号", "折线图缩放轴默认状态"] }
```

**格式 B — 直接传数组：**
```json
["主按钮大号", "折线图缩放轴默认状态"]
```

**响应 200：** 按输入顺序返回结果数组

```json
[
  {
    "source": "ict-ui",
    "sourceLabel": "ICT UI 组件库",
    "componentSetName": "1.按钮",
    "componentKey": "9a9da828027b6bdc773731bb333817c0799c208d",
    "hexFile": "component/9a9da828027b6bdc773731bb333817c0799c208d.txt",
    "path": "ict-ui/component/9a9da828027b6bdc773731bb333817c0799c208d.txt",
    "variant": { "name": "...", "variantKey": "...", "guid": "..." },
    "reason": "..."
  },
  {
    "source": "h-design-chart",
    "sourceLabel": "H Design 图表库",
    "componentSetName": "折线图",
    "componentKey": "93_55829",
    "hexFile": "component/93_55829.txt",
    "path": "h-design-chart/component/93_55829.txt",
    "variant": { "name": "...", "variantKey": "...", "guid": "..." },
    "reason": "..."
  }
]
```

单条失败时该项为：
```json
{ "error": "...", "description": "主按钮大号" }
```

**响应 400 — 格式错误或超出限制：**
```json
{ "error": "body must be an array or { descriptions: [] }" }
{ "error": "descriptions array is empty" }
{ "error": "max 100 descriptions per request" }
{ "error": "invalid descriptions", "details": [{ "index": 0, "error": "description is required" }] }
```

> 批量匹配内部 5 并发执行，实测 10 条描述耗时约 10~15 秒。

---

### POST /match-dsl

输入一棵 node-dsl 节点树，自动提取所有可匹配节点（`button` / `input` / `navbar` / `tabbar` / `switch` / `badge` / `avatar`），**整页统一匹配**：把本页所有实例合并成一次 LLM 裁决（先各自本地过滤候选，再统一选组件集、按所选组件集分组统一选变体），让模型看到全局上下文后再下结论，因此语义相同的多个实例（如同一页里的多个"确定按钮"）会被稳定地匹配到同一个组件集和变体。

> 想对照"逐节点独立匹配"的旧行为或排查问题，见下方 [`POST /match-dsl-single`](#post-match-dsl-single)。

**请求方式（二选一）：**

**方式 A — multipart 文件上传：**
```bash
curl -X POST http://localhost:3102/match-dsl -F "file=@page.json"
```

**方式 B — JSON body：**
```bash
curl -X POST http://localhost:3102/match-dsl \
  -H "Content-Type: application/json" \
  -d '{ "nid": 1, "semantic": "container", "children": [...] }'
```

**DSL 节点树结构要求：**

- 根节点需包含 `nid`（节点 ID）、`semantic`（语义类型）、`children`（子节点数组）
- 可匹配节点需包含：`nid`、`semantic`（必须为 `button`/`input`/`navbar`/`tabbar`/`switch`/`badge`/`avatar`）、`label`（描述文本）
- 不匹配的节点会被跳过（如 `container`、`text` 等）

**响应 200：** 按深度优先顺序返回匹配结果数组（仅含参与匹配的节点）

```json
[
  {
    "nid": 20,
    "semantic": "button",
    "label": "主登录按钮",
    "match": {
      "source": "ict-ui",
      "sourceLabel": "ICT UI 组件库",
      "componentSetName": "1.按钮",
      "componentKey": "9a9da828027b6bdc773731bb333817c0799c208d",
      "hexFile": "component/9a9da828027b6bdc773731bb333817c0799c208d.txt",
      "path": "ict-ui/component/9a9da828027b6bdc773731bb333817c0799c208d.txt",
      "variant": {
        "name": "status=primary, Interaction=default, size=large, disabled=false",
        "variantKey": "7f599a2db9d8ac901cf4c858825d1e04221d3021",
        "guid": "4280:102987"
      },
      "reason": "..."
    }
  },
  {
    "nid": 30,
    "semantic": "input",
    "label": "用户名输入框",
    "match": {
      "source": "ict-ui",
      "sourceLabel": "ICT UI 组件库",
      "componentSetName": "2.输入框",
      "componentKey": "...",
      "hexFile": "component/xxx.txt",
      "path": "ict-ui/component/xxx.txt",
      "variant": { "name": "...", "variantKey": "...", "guid": "..." },
      "reason": "..."
    }
  }
]
```

**响应字段说明：**

| 字段 | 说明 |
|---|---|
| `nid` | 原节点 ID（与输入一致） |
| `semantic` | 节点语义类型（如 `button`、`input`） |
| `label` | 原节点描述文本 |
| `match` | 匹配结果对象（结构同 `/match` 响应） |
| `match.path` | **重要**：相对共享数据目录的完整路径 |

**响应 400 — 文件或 JSON 格式错误：**
```json
{ "error": "uploaded file is not valid JSON" }
{ "error": "send a file via -F \"file=@page.json\" or a JSON body" }
```

> 实测对最小节点树（仅 `container` 根节点，无可匹配子节点）返回 `[]`。

---

### POST /match-dsl-single

和 `/match-dsl` 接受同样的输入（multipart 文件 / JSON body 二选一），返回同样结构的结果数组，唯一区别是匹配方式：**逐节点独立匹配**——每个实例各自跑一遍完整的"语义提取 → 选组件集 → 选变体"三步流程（即 `/match` 单条匹配的逻辑，内部 5 并发执行），互不知情。

这是 `/match-dsl` 改为整页统一匹配之前的行为，保留下来供需要对照旧结果或排查"统一匹配"相关问题时使用；**新接入直接用 `/match-dsl` 即可**，它能让同语义的多个实例得到一致的匹配结果，调用次数也更少。

**请求方式（二选一）：**

```bash
# multipart 文件上传
curl -X POST http://localhost:3102/match-dsl-single -F "file=@page.json"

# JSON body
curl -X POST http://localhost:3102/match-dsl-single \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

**响应 200 / 400：** 与 [`POST /match-dsl`](#post-match-dsl) 完全一致。

---

## 核心能力一览

| 能力 | 接口 | 说明 |
|---|---|---|
| 单条匹配 | `/match` | LLM 语义匹配，返回单个组件变体 |
| 批量匹配 | `/batch` | 批量语义匹配（最多 100 条），5 并发执行 |
| DSL 匹配（统一） | `/match-dsl` | 从 DSL 节点树自动提取匹配，整页统一裁决（推荐） |
| DSL 匹配（逐节点） | `/match-dsl-single` | 逐节点独立匹配（旧行为，供排查使用） |

---

## 架构说明

本服务与 **lib-admin-service**（端口 3103）共享数据目录：

- **本服务职责**：
  - 只读 `search_index.json` 进行语义匹配
  - 不负责索引生成和维护
  - 索引更新后需手动重启（TODO：自动监听机制）

- **lib-admin-service 职责**：
  - 拆解 .pix 文件：`POST /split`
  - 注册组件库：`POST /sources`
  - 生成和维护 `search_index.json`：`POST /rebuild-index`
  - 提供 hex 文件：`GET /hex/:key`

- **索引同步**：
  - `search_index.json` 由 lib-admin-service 生成
  - 本服务只读该文件
  - lib-admin-service 索引更新后，需手动重启本服务（TODO：自动监听机制）

---

## 使用方服务获取 hex 内容

根据匹配结果的 `path` 字段直接读取本地文件：

```javascript
// 匹配结果示例
const matchResult = {
  path: "ict-ui/component/9a9da828027b6bdc773731bb333817c0799c208d.txt"
};

// 拼接完整路径
const HEX_LIB_DIR = '/Users/h30072573/lib';  // 应指向共享数据目录
const hexPath = HEX_LIB_DIR + '/' + matchResult.path;
// 结果：/Users/h30072573/lib/ict-ui/component/9a9da828027b6bdc773731bb333817c0799c208d.txt

// 读取 hex 文件
const hexContent = fs.readFileSync(hexPath, 'utf8');
```

> 不再调用 lib-admin-service 的 `/hex/:key` 接口，直接读取本地文件更高效。

---

## 调用示例

### 单条匹配

```bash
# 语义匹配，拿到匹配结果
curl -X POST http://localhost:3102/match \
  -H "Content-Type: application/json" \
  -d '{ "description": "主按钮大号" }'
```

### 批量匹配

```bash
curl -X POST http://localhost:3102/batch \
  -H "Content-Type: application/json" \
  -d '{ "descriptions": ["主按钮大号", "输入框默认", "开关关闭状态"] }'
```

### DSL 匹配

```bash
# 从文件上传 DSL 节点树
curl -X POST http://localhost:3102/match-dsl \
  -F "file=@page.json"

# 或直接传 JSON body
curl -X POST http://localhost:3102/match-dsl \
  -H "Content-Type: application/json" \
  -d '{
    "nid": 1,
    "semantic": "container",
    "children": [
      { "nid": 10, "semantic": "button", "label": "确定按钮" },
      { "nid": 20, "semantic": "input", "label": "用户名输入框" }
    ]
  }'
```

---

## TODO

- [ ] 自动监听索引变更机制（无需手动重启）
- [ ] 匹配结果缓存机制（重复匹配不调用 LLM）
- [ ] 匹配历史记录和统计接口