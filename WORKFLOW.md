# workflow.json 格式规范

`dsl-to-hex` 的 `POST /convert` 生成的 zip 包中，除 hex 与 placeholder 资源文件外，还包含一个 `workflow.json`。  
该文件描述将 zip 内容导入 Pixso 的完整执行步骤，供客户端或自动化工具机械地按顺序执行。

---

## 顶层结构

```json
{
  "version": "1.0.0",
  "meta": { ... },
  "steps": [ Step, ... ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `version` | string | workflow 格式版本 |
| `meta` | Meta | 来源信息 |
| `steps` | Step[] | 执行步骤列表，按 `order` 升序排列 |

---

## Meta

| 字段 | 类型 | 说明 |
|---|---|---|
| `file_name` | string | 设计文件名称，来自 DSL `meta.file_name` |
| `generated_at` | string | 生成时间，ISO 8601 |

---

## Step（联合类型）

`Step = ImportHexStep | InsertSvgStep | InsertImageStep`，由 `action` 字段区分。

### 公共字段

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 步骤唯一标识，供 `depends_on` 引用及变量绑定作用域 |
| `order` | number | 是 | 执行顺序编号，从 `1` 开始 |
| `action` | string | 是 | 步骤类型，见下表 |
| `description` | string | 否 | 步骤说明，仅供人读 |
| `depends_on` | string[] | 否 | 依赖的步骤 `id` 列表；未填则可立即执行 |
| `file` | string | 是 | 本步骤操作的 zip 内文件名；执行前可用此字段校验文件是否存在 |
| `api` | ApiCall | 是 | API 调用描述 |

**`action` 取值：**

| 值 | 说明 |
|---|---|
| `import_hex` | 将 `output.hex` 导入 Pixso，创建设计文件 |
| `insert_svg` | 将 SVG 文件替换到对应节点的占位符 |
| `insert_image` | 将 PNG 文件替换到对应节点的占位符 |

---

### ImportHexStep（`action = "import_hex"`）

除公共字段外，还包含：

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `output` | object | 是 | 声明从响应中提取哪些字段供后续步骤使用，value 为 JSONPath |

`output` 示例：
```json
"output": {
  "file_id": "$.data.fileId"
}
```

绑定后，后续步骤可通过 `{{import_hex.file_id}}` 引用该值。

---

### InsertSvgStep / InsertImageStep（`action = "insert_svg"` / `"insert_image"`）

除公共字段外，还包含：

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `node_id` | string | 是 | 目标节点 GUID，格式 `"sessionId:localId"`，与 DSL 图层 `id` 对应 |

---

## ApiCall

描述一次 HTTP API 调用的所有参数。

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `method` | string | 是 | HTTP 方法，如 `"POST"` |
| `endpoint` | string | 是 | API 路径，支持 `{{变量}}` 插值 |
| `content_type` | string | 是 | 请求体类型，如 `"multipart/form-data"` |
| `fields` | object | 是 | 请求字段键值对；value 以 `@` 开头表示从 zip 中读取对应文件内容上传，否则为字面字符串 |

**`fields` 中的 `@` 约定：**

```json
"fields": {
  "file": "@output.hex"
}
```

`@output.hex` 表示执行器应从 zip 中读取 `output.hex` 的文件内容作为该字段的上传体，类似 curl 的 `@file` 语法。

---

## 变量插值规则

workflow 中有两类插值占位符：

| 写法 | 说明 |
|---|---|
| `{{meta.file_name}}` | 引用顶层 `meta` 字段 |
| `{{<stepId>.<outputKey>}}` | 引用某步骤 `output` 中绑定的值，`stepId` 即该步骤的 `id` |

执行器在每步完成后，将响应按 `output` 中声明的 JSONPath 提取值并存入作用域，后续步骤插值时直接查表替换。

---

## 执行顺序与并行

- 执行器按 `order` 升序执行；`depends_on` 为空的步骤可立即启动。
- 多个步骤若 `depends_on` 指向同一前置步骤，且彼此间无依赖，可**并行执行**。
- 典型拓扑：`import_hex`（order 1）→ 所有 `insert_svg`/`insert_image`（order 2+，可并行）。

---

## 完整示例

以下为一个含 1 个 SVG 占位符和 1 个图片占位符的设计稿对应的 `workflow.json`：

```json
{
  "version": "1.0.0",
  "meta": {
    "file_name": "登录页",
    "generated_at": "2026-06-10T08:00:00Z"
  },
  "steps": [
    {
      "id": "import_hex",
      "order": 1,
      "action": "import_hex",
      "description": "导入 hex 文件到 Pixso，获取 file_id",
      "file": "output.hex",
      "api": {
        "method": "POST",
        "endpoint": "/openapi/files/import",
        "content_type": "multipart/form-data",
        "fields": {
          "file": "@output.hex",
          "name": "{{meta.file_name}}"
        }
      },
      "output": {
        "file_id": "$.data.fileId"
      }
    },
    {
      "id": "insert_svg_1_14",
      "order": 2,
      "action": "insert_svg",
      "description": "替换节点 1:14 的 SVG 占位符",
      "depends_on": ["import_hex"],
      "file": "1_14.svg",
      "node_id": "1:14",
      "api": {
        "method": "POST",
        "endpoint": "/openapi/files/{{import_hex.file_id}}/nodes/replace-asset",
        "content_type": "multipart/form-data",
        "fields": {
          "file": "@1_14.svg",
          "nodeId": "1:14",
          "type": "svg"
        }
      }
    },
    {
      "id": "insert_image_9999_2",
      "order": 2,
      "action": "insert_image",
      "description": "替换节点 9999:2 的图片占位符",
      "depends_on": ["import_hex"],
      "file": "9999_2.png",
      "node_id": "9999:2",
      "api": {
        "method": "POST",
        "endpoint": "/openapi/files/{{import_hex.file_id}}/nodes/replace-asset",
        "content_type": "multipart/form-data",
        "fields": {
          "file": "@9999_2.png",
          "nodeId": "9999:2",
          "type": "image"
        }
      }
    }
  ]
}
```

---

## zip 包内容（更新后）

| 文件名 | 说明 |
|---|---|
| `output.hex` | Pixso 可导入的 hex 文件 |
| `{guid}.svg` | SVG 占位符文件（`guid` = 图层 `id` 中 `:` 替换为 `_`）|
| `{guid}.png` | 图片占位符文件 |
| `workflow.json` | 本文档描述的执行流程，客户端按此文件驱动导入 |
