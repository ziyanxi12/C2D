# component-vector — 组件/图标向量检索服务

基于 Elasticsearch KNN + DashScope Embedding 的语义检索服务，支持组件变体和图标两个库。

---

## 目录结构

```
component-vector/
├── build_vector_index.js   # 构建组件变体向量索引
├── build_icon_index.js     # 构建图标向量索引
├── vector_search.js        # 组件检索模块（可作为库引入）
├── icon_search.js          # 图标检索模块（可作为库引入）
├── server.js               # HTTP API 服务
├── es_client.js            # Elasticsearch 客户端
├── value_translations.json # 变体属性中英文翻译表
├── icons.json              # 图标数据
├── .env                    # 环境变量（需自行填写）
└── .env.example            # 环境变量模板
```

---

## 原始数据说明

### 1. 组件库 — `../component_index.json`

位于 `nodejs/component_index.json`，由设计工具导出，格式如下：

```json
{
  "componentSets": [
    {
      "name": "文字链接",
      "guid": "8229:277383",
      "componentKey": "be1d28168c521684a3d888b60f9e8a645653b4b7",
      "canvasName": "1.基础类",
      "hexFile": "component/be1d28168c521684a3d888b60f9e8a645653b4b7.txt",
      "variants": [
        {
          "name": "status=independent, Interaction=default, size=normal, disabled=false",
          "guid": "8229:277395",
          "variantKey": "f88483c3510885a0ff9c365f3e6f1d06375b530a",
          "parentKey": "be1d28168c521684a3d888b60f9e8a645653b4b7"
        }
      ]
    }
  ],
  "standaloneComponents": [
    {
      "name": "拖拽把手",
      "guid": "9203:301533",
      "componentKey": "5456d4300bce1bdcd8e757e3e5d499f61c207c18",
      "canvasName": "2.容器类",
      "hexFile": "component/5456d4300bce1bdcd8e757e3e5d499f61c207c18.txt"
    }
  ]
}
```

- `componentSets`：有变体的组件集（每个 variant 单独生成一条向量记录）
- `standaloneComponents`：无变体的独立组件（整体生成一条记录）
- `hexFile`：对应的渲染文件路径，会作为 `path` 字段写入 ES

**Embedding 文本生成逻辑**：

变体名是英文 key=value 格式，会通过 `value_translations.json` 翻译成中英双语再拼接：

```
文字链接  基础类  independent 独立  default 默认  normal 标准  可用
└─name  └─canvasName  └──────────── variant.name 翻译后 ────────────┘
```

> 为什么要翻译：变体属性是设计工具内部约定的英文值（如 `Interaction=hover`），
> 不是自然语言。加上中文让模型对中文查询更精准。多语言模型对英文查询同样有效，
> 双语文本是"双重保险"。

### 2. 图标库 — `icons.json`

位于 `component-vector/icons.json`，格式如下：

```json
[
  {
    "id": "下载",
    "name": "下载",
    "description": "下载图标，向下箭头带横线，用于文件下载、保存到本地等场景",
    "svg": "<svg>...</svg>"
  }
]
```

- `id`/`name`：图标名称
- `description`：语义描述（是 embedding 的主要语义来源）
- `svg`：不参与 embedding，只是附属数据（当前未写入 ES）

Embedding 文本 = `name + englishName + description`，拼接规则：

- `name`：中文名称，直接使用
- `englishName`：若是自然英文（如 `"download"`）直接使用；若是标识符风格（如 `"ic_it_terminology_qa"`），去掉 `ic_` 前缀、下划线转空格后使用（→ `"it terminology qa"`）
- `description`：若是中文自然语言直接使用；若是 camelCase 标识符（如 `"terminologyQA"`），拆词后使用（→ `"terminology QA"`）

示例：

| 字段 | 值 | 写入文本 |
|------|-----|---------|
| name | 下载 | 下载 |
| englishName | download | download |
| description | 下载图标，向下箭头... | 下载图标，向下箭头... |
| **→ embedding** | | **下载 download 下载图标，向下箭头...** |

| 字段 | 值 | 写入文本 |
|------|-----|---------|
| name | 术语问答 | 术语问答 |
| englishName | ic_it_terminology_qa | it terminology qa |
| description | terminologyQA | terminology QA |
| **→ embedding** | | **术语问答 it terminology qa terminology QA** |

---

## 配置

复制 `.env.example` 为 `.env` 并填写：

```bash
cp .env.example .env
```

关键配置项：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DASHSCOPE_API_KEY` | — | DashScope API Key（必填） |
| `EMBEDDING_BASE_URL` | DashScope 地址 | Embedding API 地址 |
| `EMBEDDING_MODEL` | `text-embedding-v3` | 模型名 |
| `EMBEDDING_DIM` | `1024` | 向量维度，需与模型一致 |
| `COMPONENT_INDEX_PATH` | `../component_index.json` | 组件库输入文件 |
| `ICONS_PATH` | `./icons.json` | 图标库输入文件 |
| `ES_URL` | `http://localhost:9200` | Elasticsearch 地址 |
| `ES_INDEX` | `component_variants` | 组件 ES 索引名 |
| `ICON_ES_INDEX` | `component_icons` | 图标 ES 索引名 |
| `PORT` | `3100` | API 服务端口 |

---

## 执行步骤

### 第一步：安装依赖

```bash
cd nodejs/component-vector
npm install
```

### 第二步：构建向量索引

**组件库：**

```bash
npm run build
# 等价于：node build_vector_index.js
```

**图标库：**

```bash
npm run build-icons
# 等价于：node build_icon_index.js
```

> **Mock 模式**（不调用 API，用随机向量，用于验证 ES 写入流程）：
> ```bash
> npm run build:mock
> npm run build-icons:mock
> ```

构建完成后会打印写入条数：
```
完成！ES 索引 component_variants 共 2847 条文档
完成！ES 索引 component_icons 共 1003 条文档
```

### 第三步：启动 API 服务

```bash
npm start
# 等价于：node server.js
```

---

## API 使用

### 查询组件变体

```
POST /api/search/component
Content-Type: application/json

{ "query": "主要按钮悬停状态", "topK": 3 }
```

返回：

```json
{
  "results": [
    {
      "score": 0.9412,
      "symbol_id": "8229:277418",
      "variant_key": "d280a55acfe6b7d8bba7d3a2bdf4f538e1f94555",
      "component_set_key": "be1d28168c521684a3d888b60f9e8a645653b4b7",
      "component_set_resolved": true,
      "path": "component/be1d28168c521684a3d888b60f9e8a645653b4b7.txt"
    }
  ]
}
```

### 查询图标

```
POST /api/search/icon
Content-Type: application/json

{ "query": "下载文件", "topK": 5 }
```

返回：

```json
{
  "results": [
    {
      "score": 0.9731,
      "icon_id": "下载",
      "name": "下载",
      "description": "下载图标，向下箭头带横线，用于文件下载、保存到本地等场景"
    }
  ]
}
```

> 支持中英文混合查询，如 `"button hover"` 、`"down icon"` 均可正常命中。

### CLI 快速测试（无需启动服务）

```bash
# 组件检索
node vector_search.js "主要按钮悬停" 3

# 图标检索
node icon_search.js "下载文件" 5
node icon_search.js "down icon" 5
```

---

## 新增一个库

以"新增一套图表组件库"为例，说明完整流程。

### 情况一：新库是「组件变体」类型（有 variants）

数据格式与 `component_index.json` 相同，追加写入同一个 ES 索引即可。

**1. 准备数据文件**，格式与 `component_index.json` 一致。

**2. 追加写入**（不删除旧索引）：

```bash
COMPONENT_INDEX_PATH=/path/to/chart_index.json REINDEX=1 node build_vector_index.js
```

> `REINDEX=1` 表示不删除旧索引，只追加写入。

**3. 如果变体属性有新的英文值需要翻译**，在 `value_translations.json` 中补充：

```json
{
  "chartType=line":  "折线图 line chart",
  "chartType=bar":   "柱状图 bar chart",
  "chartType=pie":   "饼图 pie chart"
}
```

格式规则：
- `key=value` → 精确匹配（优先）
- `value` → 任意 key 下的该值（通用匹配）
- value 部分填中文同义词，空格分隔

### 情况二：新库是「图标」类型（只有 id/name/description）

**1. 准备数据文件**，格式与 `icons.json` 一致：

```json
[
  {
    "id": "chart-line",
    "name": "折线图",
    "description": "折线图图标，用于展示数据趋势..."
  }
]
```

**2. 选择处理方式：**

- **追加到同一索引**（与现有图标混在一起）：
  ```bash
  ICONS_PATH=/path/to/chart_icons.json REINDEX=1 node build_icon_index.js
  ```

- **独立的新索引**（推荐，方便按库筛选）：
  ```bash
  ICONS_PATH=/path/to/chart_icons.json ICON_ES_INDEX=chart_icons node build_icon_index.js
  ```
  然后在 `server.js` 的 `ROUTES` 中新增对应的查询路由。

### 情况三：新库是全新格式

1. 新建一个 `build_xxx_index.js`，参考 `build_icon_index.js` 的结构
2. 核心只需关注两件事：
   - **拼 embedding 文本**：把语义字段拼成自然语言句子
   - **决定 ES 字段**：需要查询返回哪些字段，在 mapping 和 `_source` 里声明
3. 新建对应的 `xxx_search.js`，在 `server.js` 中注册路由

---

## ES 索引结构

### component_variants（组件变体）

| 字段 | 类型 | 说明 |
|------|------|------|
| `embedding` | `dense_vector` | 向量（1024维） |
| `text` | `text` | embedding 原始文本（调试用） |
| `symbol_id` | `keyword` | 变体的 guid |
| `variant_key` | `keyword` | 变体的 key |
| `component_set_key` | `keyword` | 组件集的 key |
| `component_set_resolved` | `boolean` | 固定为 true |
| `path` | `keyword` | 对应渲染文件路径 |

### component_icons（图标）

| 字段 | 类型 | 说明 |
|------|------|------|
| `embedding` | `dense_vector` | 向量（1024维） |
| `text` | `text` | embedding 原始文本（调试用） |
| `icon_id` | `keyword` | 图标 id |
| `name` | `keyword` | 图标名称 |
| `description` | `text` | 图标语义描述 |
