# component-vector — 组件/图标向量检索服务

基于 Elasticsearch KNN + Embedding API 的语义检索服务，支持组件变体和图标两个库。

---

## 环境要求

- Python 3.8+

---

## 目录结构

```
component-vector/
├── build_vector_index.py   # 构建组件变体向量索引
├── build_icon_index.py     # 构建图标向量索引
├── vector_search.py        # 组件检索模块（可作为库引入）
├── icon_search.py          # 图标检索模块（可作为库引入）
├── server.py               # HTTP API 服务
├── es_client.py            # Elasticsearch 客户端
├── embed_client.py         # Embedding API 客户端
├── config.py               # 配置管理
├── value_translations.json # 变体属性中英文翻译表
├── icons.json              # 图标数据
├── requirements.txt        # Python 依赖
├── .env                    # 环境变量（需自行填写）
└── .env.example            # 环境变量模板
```

---

## 配置

复制 `.env.example` 为 `.env` 并填写：

```bash
cp .env.example .env
```

关键配置项：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DASHSCOPE_API_KEY` | — | Embedding API Key（必填） |
| `EMBEDDING_BASE_URL` | — | Embedding API 地址 |
| `EMBEDDING_MODEL` | `text-embedding-v3` | 模型名 |
| `EMBEDDING_DIM` | `1024` | 向量维度，需与模型一致 |
| `COMPONENT_INDEX_PATH` | `../component_index.json` | 组件库输入文件 |
| `ICONS_PATH` | `./icons.json` | 图标库输入文件 |
| `ES_URL` | `http://localhost:9200` | Elasticsearch 地址 |
| `ES_USERNAME` | `elastic` | ES 用户名 |
| `ES_PASSWORD` | — | ES 密码 |
| `ES_INDEX` | `component_variants` | 组件 ES 索引名 |
| `ICON_ES_INDEX` | `component_icons` | 图标 ES 索引名 |
| `PORT` | `3100` | API 服务端口 |
| `MOCK_EMBED` | — | 设为 `1` 使用随机向量（测试用） |
| `REINDEX` | — | 设为 `1` 追加模式（不删除旧索引） |

---

## 执行步骤

### 第一步：安装依赖

```bash
cd nodejs/component-vector
pip install -r requirements.txt
```

### 第二步：生成向量并存入 ES

**构建组件库索引：**

```bash
python build_vector_index.py
```

**构建图标库索引：**

```bash
python build_icon_index.py
```

构建过程：
1. 读取原始数据（`component_index.json` 或 `icons.json`）
2. 拼接 embedding 文本
3. 调用 Embedding API 获取向量
4. 批量写入 Elasticsearch

> **Mock 模式**（不调用 Embedding API，用随机向量测试）：
> ```bash
> MOCK_EMBED=1 python build_vector_index.py
> MOCK_EMBED=1 python build_icon_index.py
> ```

构建完成后会打印写入条数：
```
完成！ES 索引 component_variants 共 2847 条文档
完成！ES 索引 component_icons 共 1003 条文档
```

### 第三步：查询

#### 方式一：启动 HTTP 服务

```bash
python server.py
```

服务启动后监听 `http://localhost:3100`

**查询组件变体（单个）：**
```bash
curl -X POST http://localhost:3100/api/search/component \
  -H "Content-Type: application/json" \
  -d '{"query": "主要按钮悬停状态", "topK": 3}'
```

**查询组件变体（批量）：**
```bash
curl -X POST http://localhost:3100/api/search/component/batch \
  -H "Content-Type: application/json" \
  -d '{"queries": ["主要按钮", "禁用状态", "输入框"], "topK": 3}'
```

**查询图标（单个）：**
```bash
curl -X POST http://localhost:3100/api/search/icon \
  -H "Content-Type: application/json" \
  -d '{"query": "下载文件", "topK": 5}'
```

**查询图标（批量）：**
```bash
curl -X POST http://localhost:3100/api/search/icon/batch \
  -H "Content-Type: application/json" \
  -d '{"queries": ["下载", "上传", "设置"], "topK": 5}'
```

#### 方式二：CLI 直接查询（无需启动服务）

```bash
# 组件检索
python vector_search.py "主要按钮悬停" 3
python vector_search.py "文字链接 禁用" 5

# 图标检索
python icon_search.py "下载文件" 5
python icon_search.py "down icon" 5
```

#### 方式三：作为 Python 库引入

```python
from vector_search import search_variant, search_variant_batch
from icon_search import search_icon, search_icon_batch

# 单个查询
results = search_variant("主要按钮悬停状态", top_k=3)
results = search_icon("下载文件", top_k=5)

# 批量查询
results = search_variant_batch(["主要按钮", "禁用状态"], top_k=3)
results = search_icon_batch(["下载", "上传", "设置"], top_k=5)
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

## API 使用

### 查询组件变体（单个）

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
      "path": "component/be1d28168c521684a3d888b60f9e8a645653b4b7.txt",
      "name": "按钮",
      "canvas_name": "1.基础类",
      "variant_name": "type=primary, status=hover"
    }
  ]
}
```

### 查询组件变体（批量）

```
POST /api/search/component/batch
Content-Type: application/json

{ "queries": ["主要按钮", "禁用状态", "输入框"], "topK": 3 }
```

返回：

```json
{
  "results": [
    [/* 第一个 query 的 topK 结果 */],
    [/* 第二个 query 的 topK 结果 */],
    [/* 第三个 query 的 topK 结果 */]
  ]
}
```

### 查询图标（单个）

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
      "english_name": "download",
      "description": "下载图标，向下箭头带横线，用于文件下载、保存到本地等场景"
    }
  ]
}
```

### 查询图标（批量）

```
POST /api/search/icon/batch
Content-Type: application/json

{ "queries": ["下载", "上传", "设置"], "topK": 5 }
```

返回：

```json
{
  "results": [
    [/* "下载" 的 topK 结果 */],
    [/* "上传" 的 topK 结果 */],
    [/* "设置" 的 topK 结果 */]
  ]
}
```

> 支持中英文混合查询，如 `"button hover"` 、`"down icon"` 均可正常命中。

---

## 新增一个库

以"新增一套图表组件库"为例，说明完整流程。

### 情况一：新库是「组件变体」类型（有 variants）

数据格式与 `component_index.json` 相同，追加写入同一个 ES 索引即可。

**1. 准备数据文件**，格式与 `component_index.json` 一致。

**2. 追加写入**（不删除旧索引）：

```bash
COMPONENT_INDEX_PATH=/path/to/chart_index.json REINDEX=1 python build_vector_index.py
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
  ICONS_PATH=/path/to/chart_icons.json REINDEX=1 python build_icon_index.py
  ```

- **独立的新索引**（推荐，方便按库筛选）：
  ```bash
  ICONS_PATH=/path/to/chart_icons.json ICON_ES_INDEX=chart_icons python build_icon_index.py
  ```
  然后在 `server.py` 中新增对应的查询路由。

### 情况三：新库是全新格式

1. 新建一个 `build_xxx_index.py`，参考 `build_icon_index.py` 的结构
2. 核心只需关注两件事：
   - **拼 embedding 文本**：把语义字段拼成自然语言句子
   - **决定 ES 字段**：需要查询返回哪些字段，在 mapping 和 `_source` 里声明
3. 新建对应的 `xxx_search.py`，在 `server.py` 中注册路由

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
| `name` | `keyword` | 组件名称 |
| `canvas_name` | `keyword` | 画布名称 |
| `variant_name` | `keyword` | 变体名称 |

### component_icons（图标）

| 字段 | 类型 | 说明 |
|------|------|------|
| `embedding` | `dense_vector` | 向量（1024维） |
| `text` | `text` | embedding 原始文本（调试用） |
| `icon_id` | `keyword` | 图标 id |
| `name` | `keyword` | 图标名称 |
| `english_name` | `keyword` | 图标英文名 |
| `description` | `text` | 图标语义描述 |

---

## 删除 ES 索引

### 方法一：Python 代码

```python
from es_client import delete_index, list_indices

# 列出所有索引
print(list_indices())

# 删除指定索引
delete_index('component_variants')
delete_index('component_icons')
```

### 方法二：重新构建时自动删除

默认情况下，运行构建脚本会先删除旧索引再重建：

```bash
python build_vector_index.py   # 会删除 component_variants 索引
python build_icon_index.py     # 会删除 component_icons 索引
```

如果要保留旧数据并追加，使用 `REINDEX=1`：

```bash
REINDEX=1 python build_vector_index.py
```

### 方法三：curl 直接操作 ES

```bash
# 删除组件索引
curl -X DELETE "http://localhost:9200/component_variants"

# 删除图标索引
curl -X DELETE "http://localhost:9200/component_icons"
```

---

## Embedding API 调用说明

本项目使用 `requests.post()` 调用 Embedding API 获取向量。

### 调用方式

```python
import requests

response = requests.post(
    "https://your-embedding-api.com/embeddings",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={
        "model": "text-embedding-v3",
        "input": ["文本1", "文本2"],
        "dimensions": 1024,
        "encoding_format": "float",
    },
    timeout=60,
)
result = response.json()
vectors = [item["embedding"] for item in result["data"]]
```

### 请求参数

| 参数 | 说明 |
|------|------|
| `model` | 模型名称，通过 `EMBEDDING_MODEL` 环境变量配置 |
| `input` | 文本列表，单批最多 25 条 |
| `dimensions` | 向量维度，通过 `EMBEDDING_DIM` 环境变量配置 |
| `encoding_format` | 固定为 `float` |

### 响应格式

```json
{
  "data": [
    { "index": 0, "embedding": [0.1, 0.2, ...] },
    { "index": 1, "embedding": [0.3, 0.4, ...] }
  ]
}
```

### 批量处理

当文本数量超过 25 条时，`embed_many()` 会自动分批调用：

```python
from embed_client import embed_many

# 自动分批，每批 25 条
vectors = embed_many(["文本1", "文本2", ..., "文本100"])
```

### Mock 模式

测试时可设置 `MOCK_EMBED=1` 使用随机向量，不调用真实 API：

```bash
MOCK_EMBED=1 python build_vector_index.py
```