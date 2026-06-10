# 新增/更新组件库：全程在 `lib-admin-service` 内完成

当有一个新的 `.pix` 组件库需要接入，或已有组件库内容有更新时，**全部步骤都在本服务内完成**，无需借助任何外部脚本或手动复制文件。仅 `LIB_OUT_DIR` 指向的 hex 静态资源（`{source}/component/*.txt`）放在服务外的指定目录，其余（组件库注册表 `sources.json`、索引生成逻辑 `rebuild_index.js`、`search_index.json`）都内置在本服务里、随服务一起维护。

---

## 一、新增组件库完整流程

完整链路：

```
① POST /split (source=xxx)   ② POST /sources              ③ POST /rebuild-index
拆解 .pix 落盘到                登记 {key,label} 到            读取各 source 的 component_index.json
LIB_OUT_DIR/{source}/           本服务的 sources.json          → 合并 → 重写 search_index.json
component/                                                    → 热重载 hexPathMap
                                                                   ↓
                                                             无需重启，立即生效
```

### 第 ① 步：拆解组件库，产出 `component/` 目录

直接调用本服务的 [`POST /split`](./API.md#post-split)，传 `source` 参数让拆解结果直接落盘到 `LIB_OUT_DIR/{source}/component/`，免去手动解压挪动：

```bash
curl -s -X POST http://localhost:3103/split \
  -F "file=@<新组件库>.pix" \
  -F "publishFile=<publish-id>" \
  -F "source=<新库目录名>"
```

**参数说明：**

| 参数 | 必填 | 说明 |
|---|---|---|
| `file` | 是 | `.pix` 组件库文件 |
| `publishFile` | 否 | 缺少 `componentKey` 时用于补写发布信息（生成规则：`componentKey = SHA1(publishFile + sessionID:localID)`） |
| `source` | 是 | 新库的目录名（即 `LIB_OUT_DIR/` 下的子目录名） |

**产出的目录结构：**

```
{LIB_OUT_DIR}/<新库目录名>/
└── component/
    ├── component_index.json   # 必须：记录该库所有组件集/独立组件及其 hexFile 路径
    ├── {componentKey 或 sessionId_localId}.txt
    └── ...
```

> **`<新库目录名>` 即后续的 `source` key，建议直接用新库名的 kebab-case**——它既是 `LIB_OUT_DIR/` 下的子目录名，也是 `sources.json` 里的 `key`，还是 `search_index.json` 里每条 entry 的 `source` 字段。三者必须完全一致，否则拼出来的路径会找不到文件。

**响应示例：**

```json
{
  "stats": {
    "total": 491,
    "componentSets": 319,
    "standaloneComponents": 172,
    "compDir": "component",
    "indexFile": "component/component_index.json"
  },
  "savedTo": "<新库目录名>/component"
}
```

- `total` - 写出的文件总数
- `componentSets` - 组件集数量
- `standaloneComponents` - 独立组件数量
- `savedTo` - 相对 `LIB_OUT_DIR` 的路径

**错误处理：**

| 状态码 | 错误信息 | 原因 |
|---|---|---|
| 400 | `send a .pix file via -F "file=@library.pix"` | 未上传文件 |
| 400 | `source must be a simple directory name...` | `source` 格式错误（包含路径分隔符或非法字符） |
| 500 | `parse failed: <文件名>` | 文件不是合法 `.pix` 文件 |
| 500 | `no component sets found` | 文件中没有可拆出的组件集 |
| 500 | `目标目录已存在...` | `{source}/component/` 目录已存在，需先删除 |

> ⚠️ 上传体积限制 200MB。若目标目录已存在，需先手动删除：
> ```bash
> rm -rf {LIB_OUT_DIR}/{source}/component
> ```

---

### 第 ② 步：登记到 `sources.json`

调用 [`POST /sources`](./API.md#post-sources) 把新库注册进本服务的组件库列表（持久化在 `nodejs/lib-admin-service/sources.json`，服务重启后依然有效）：

```bash
curl -s -X POST http://localhost:3103/sources \
  -H "Content-Type: application/json" \
  -d '{ "key": "<新库目录名>", "label": "<展示用中文名>" }'
```

**参数说明：**

| 字段 | 必填 | 说明 |
|---|---|---|
| `key` | 是 | 必须与 `LIB_OUT_DIR/` 下的子目录名**完全一致**（决定运行时路径拼接是否正确），只能包含字母/数字/`-`/`_`，不允许路径分隔符 |
| `label` | 是 | 展示用的中文名，会出现在匹配结果的 `sourceLabel` 字段里 |

**响应示例：**

```json
{
  "sources": [
    { "key": "ict-ui", "label": "ICT UI 组件库" },
    { "key": "<新库目录名>", "label": "<展示用中文名>" }
  ]
}
```

**错误处理：**

| 状态码 | 错误信息 | 原因 |
|---|---|---|
| 400 | `key must be a simple directory name...` | `key` 格式错误 |
| 400 | `label is required` | 缺少 `label` 字段 |
| 409 | `source already registered: <key>` | `key` 已注册（重复注册） |

> 用 [`GET /sources`](./API.md#get-sources) 随时查看当前已注册的组件库列表。

---

### 第 ③ 步：重新生成索引并热重载

调用 [`POST /rebuild-index`](./API.md#post-rebuild-index)，一步完成「读取 `sources.json` 中每个库的 `component_index.json` → 合并打标 → 重写 `search_index.json` → 重建 `hexPathMap`」，**无需重启服务**：

```bash
curl -s -X POST http://localhost:3103/rebuild-index
```

**响应示例：**

```json
{
  "entries": 653,
  "sources": [
    { "key": "ict-ui", "label": "ICT UI 组件库", "componentSets": 319, "standaloneComponents": 172 },
    { "key": "<新库目录名>", "label": "<展示用中文名>", "componentSets": 50, "standaloneComponents": 10 }
  ],
  "hex_keys": 653
}
```

- `entries` - 合并后的总条目数
- `sources` - 每个库贡献的条目数
- `hex_keys` - 热重载后的 hex key 映射条数

**错误处理：**

| 状态码 | 错误信息 | 原因 |
|---|---|---|
| 200 但某库 `skipped: true` | `not found: .../component_index.json` | 该库的 `component_index.json` 不存在（检查 `/split` 的 `source` 是否与 `sources.json` 里的 `key` 一致） |
| 500 | `...` | `LIB_OUT_DIR` 不可读或其他错误 |

> 调用前后对比 `GET /health` 的 `hex_keys`，可确认新库是否成功接入及增量是否符合预期。

---

### 第 ④ 步：验证

```bash
# 1. 确认 hex_keys 总数比接入前增加了（增量应等于新库贡献的 entry 数）
curl -s http://localhost:3103/health

# 2. 抽取新库 component_index.json 里的某个 hexFile，验证能查到
curl -s http://localhost:3103/hex/<新库里的某个key>

# 3. （可选）用新库特有的组件描述跑一次语义匹配，确认能命中且 source/sourceLabel 正确
curl -s -X POST http://localhost:3102/match -H "Content-Type: application/json" \
  -d '{ "description": "<新库中某组件的典型描述>" }'
```

---

## 二、更新已有组件库流程

当已有组件库内容有更新（如新增组件、修改组件属性），但 `source` key 不变时：

### 步骤概览

```
① 删除旧数据    ② POST /split (source=相同)    ③ POST /rebuild-index
手动删除 {source}/    拆解新 .pix 落盘                 重建索引并热重载
component/           到同一目录
```

### 详细步骤

**第 ① 步：删除旧数据**

```bash
# 删除旧组件数据
rm -rf {LIB_OUT_DIR}/{source}/component
```

例如：
```bash
rm -rf ~/lib/ict-ui/component
```

**第 ② 步：拆解新数据**

```bash
curl -s -X POST http://localhost:3103/split \
  -F "file=@<更新后的组件库>.pix" \
  -F "source=<相同的source>" \
  -F "publishFile=<publish-id>"
```

> `source` 保持不变，与 `sources.json` 里的 `key` 一致。

**第 ③ 步：重建索引**

```bash
curl -s -X POST http://localhost:3103/rebuild-index
```

> `sources.json` 无需改动，直接重建索引即可。

**第 ④ 步：验证**

```bash
curl -s http://localhost:3103/health
curl -s http://localhost:3103/hex/<某个key>
```

---

## 三、跨服务操作说明

### lib-admin-service 和 dsl-match-service 的关系

| 服务 | 端口 | 职责 |
|---|---|---|
| **lib-admin-service** | 3103 | 拆解、注册、索引管理、hex 文件获取 |
| **dsl-match-service** | 3102 | DSL 语义匹配（只读索引） |

### 索引更新后的同步

**当前方案（手动）：**

1. lib-admin-service 执行 `POST /rebuild-index` 生成新索引
2. 手动重启 dsl-match-service：
   ```bash
   # 找到进程并重启
   pkill -f "node.*dsl-match-service/server.js"
   cd ~/nodejs/dsl-match-service
   node server.js
   ```

**未来方案（自动监听）：**

TODO：实现自动监听机制（WebSocket 通知 / 文件监听 `fs.watch` / HTTP webhook），lib-admin-service 索引更新后自动通知 dsl-match-service 重新加载。

---

## 四、跨机器部署时的数据同步

`LIB_OUT_DIR` 是 lib-admin-service 里**唯一**允许指向外部路径的部分（其余如 `sources.json`、`search_index.json` 都在服务目录内、随服务一起部署）。

跨机器部署时，需要把新增的 `LIB_OUT_DIR/{新库目录名}/` 一并同步到目标机器上 `LIB_OUT_DIR` 指向的路径下：

```bash
# 源机器
rsync -avz {LIB_OUT_DIR}/{新库目录名}/ 目标机器:{LIB_OUT_DIR}/{新库目录名}/

# 或使用 scp
scp -r {LIB_OUT_DIR}/{新库目录名} 目标机器:{LIB_OUT_DIR}/
```

本地/同机部署默认 `LIB_OUT_DIR` 指向 `~/lib`，第①步的产物已经落在这里，无需额外操作。

---

## 五、排错提示

| 现象 | 原因 | 解决方案 |
|---|---|---|
| `/rebuild-index` 返回的 `sources` 里某库 `skipped: true` | 该 `key` 对应的 `LIB_OUT_DIR/{key}/component/component_index.json` 不存在 | 检查 `/split` 的 `source` 是否与 `sources.json` 里的 `key` 完全一致，或新库数据是否已落到 `LIB_OUT_DIR` |
| `/health` 的 `hex_keys` 没有增加 | 没有调用 `POST /rebuild-index`，或调用后 `sources` 里对应库被 `skipped` | 检查索引重建是否成功 |
| `/hex/:key` 对新库的 key 返回 404 | `sources.json` 里的 `key` 与 `LIB_OUT_DIR/` 下实际目录名不一致 | 确保三者一致：`/split` 的 `source`、`sources.json` 的 `key`、实际目录名 |
| dsl-match-service 匹配结果里出现新库但 `sourceLabel` 显示异常 | `POST /sources` 注册时 `label` 字段写错或漏写 | 在 `sources.json` 里删除旧条目，重新注册正确的 `label` |
| `key 冲突` 或同一个 key 映射到错误的文件 | 极小概率事件（新库与已有库的 hex 文件名恰好相同） | 检查 `hexPathMap` 构建逻辑（server.js），必要时改用 `source:key` 复合 key |
| `/split` 返回 500：目标目录已存在 | `{source}/component/` 目录已存在 | 先删除旧目录：`rm -rf {LIB_OUT_DIR}/{source}/component` |

---

## 六、完整示例

### 新增组件库示例

假设新增一个名为 `h-design-chart` 的图表库：

```bash
# ① 拆解 .pix 文件
curl -X POST http://localhost:3103/split \
  -F "file=@h-design-chart.pix" \
  -F "source=h-design-chart"

# ② 注册新库
curl -X POST http://localhost:3103/sources \
  -H "Content-Type: application/json" \
  -d '{ "key": "h-design-chart", "label": "H Design 图表库" }'

# ③ 重建索引
curl -X POST http://localhost:3103/rebuild-index

# ④ 验证
curl http://localhost:3103/health
curl http://localhost:3103/hex/93_55829

# ⑤ 重启 dsl-match-service（手动）
pkill -f "node.*dsl-match-service/server.js"
cd ~/nodejs/dsl-match-service
node server.js
```

### 更新已有组件库示例

假设更新 `ict-ui` 组件库：

```bash
# ① 删除旧数据
rm -rf ~/lib/ict-ui/component

# ② 拆解新数据
curl -X POST http://localhost:3103/split \
  -F "file=@ict-ui-new.pix" \
  -F "source=ict-ui"

# ③ 重建索引（sources.json 无需改动）
curl -X POST http://localhost:3103/rebuild-index

# ④ 验证
curl http://localhost:3103/health

# ⑤ 重启 dsl-match-service（手动）
pkill -f "node.*dsl-match-service/server.js"
cd ~/nodejs/dsl-match-service
node server.js
```

---

## 七、数据文件说明

### component_index.json 结构

每个组件库的 `component_index.json` 记录该库所有组件集和独立组件：

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
      "name": "独立组件名",
      "guid": "...",
      "componentKey": "...",
      "hexFile": "component/xxx.txt"
    }
  ]
}
```

### sources.json 结构

组件库注册表（存储在 `lib-admin-service/sources.json`）：

```json
{
  "sources": [
    { "key": "ict-ui", "label": "ICT UI 组件库" },
    { "key": "h-design-chart", "label": "H Design 图表库" }
  ]
}
```

### search_index.json 结构

共享索引（存储在 `LIB_OUT_DIR/search_index.json`）：

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
      "searchText": "文字链接 ICT UI 组件库 status=independent Interaction default ..."
    }
  ]
}
```

---

## 八、注意事项

1. **key 一致性**：`/split` 的 `source`、`/sources` 的 `key`、`LIB_OUT_DIR/` 下的目录名三者必须完全一致
2. **避免覆盖**：`/split` 不会覆盖已存在目录，需先删除旧数据
3. **索引同步**：lib-admin-service 索引更新后，需手动重启 dsl-match-service
4. **hex 文件命名**：
   - 旧版：40 位 SHA1 componentKey（如 `ict-ui` 库）
   - 新版：`{sessionId}_{localId}` 格式（如 `h-design-chart` 库）
5. **数据备份**：更新组件库前建议备份旧数据

---

## 九、TODO

- [ ] 自动监听索引变更机制（通知 dsl-match-service 重新加载）
- [ ] 删除已注册的组件库（`DELETE /sources/:key`）
- [ ] 组件库版本管理（多版本共存）
- [ ] 数据备份和恢复机制