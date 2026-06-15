# 设计 DSL（Phase 1）

基于 Pixso 设计稿解析出的通用结构，JSON 格式，描述图层树和云端组件实例引用。

---

## 顶层结构

```json
{
  "meta": { ... },
  "pages": [ Page, ... ]
}
```

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `meta` | Meta | 是 | 文件元信息 |
| `pages` | Page[] | 是 | 页面列表 |

---

## Meta

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `version` | string | 是 | DSL 格式版本，格式 `Major.Minor.Patch`，如 `1.0.0` |
| `source` | string | 是 | 来源标识，固定值 `"pixso"` |
| `file_id` | string | 是 | 文件唯一标识 |
| `file_name` | string | 是 | 文件名称 |
| `created_at` | string | 是 | 创建时间，ISO 8601（`YYYY-MM-DDTHH:mm:ssZ`）|
| `updated_at` | string | 是 | 更新时间，ISO 8601 |

---

## Page

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 页面 GUID，格式 `"sessionID:localID"` |
| `name` | string | 是 | 页面名称 |
| `layers` | Layer[] | 是 | 根图层列表（递归嵌套） |

---

## Layer（联合类型）

`Layer = NormalLayer | InstanceLayer`，由 `type` 字段区分。

### 公共字段

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 节点 GUID，格式 `"sessionID:localID"` |
| `name` | string | 是 | 节点名称 |
| `type` | string | 是 | 节点类型，见 [LayerType](#layertype) |
| `visible` | boolean | 是 | 是否可见 |
| `opacity` | number | 是 | 透明度，范围 `0`~`1` |
| `blend_mode` | string | 是 | 混合模式，见 [BlendMode](#blendmode) |
| `box` | BoundingBox | 是 | 节点包围框，相对父节点坐标 |
| `placeholder` | PlaceholderMeta | 否 | 占位符元信息（标记临时替代图层）|

### NormalLayer（普通图层）

`type` 为 `frame / group / rectangle / ellipse / vector / star / line / boolean / text` 之一。

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `fills` | Fill[] | 否 | 填充列表 |
| `strokes` | Stroke[] | 否 | 描边列表 |
| `stroke_width` | number | 否 | 描边宽度（px），默认为 1 |
| `effects` | Effect[] | 否 | 效果列表（阴影、模糊等），详见 [Effect](#effect) 章节（**未完整实现**）|
| `corner_radius` | number | 否 | 圆角半径（统一值）|
| `corner_radii` | number[4] | 否 | 四角独立圆角 `[TL, TR, BR, BL]`（顺时针：左上、右上、右下、左下），与 `corner_radius` 互斥 |
| `auto_layout` | AutoLayout | 否 | 自动布局（仅 `frame` 类型，且开启了 Auto Layout）|
| `text_content` | string | 否 | 文本内容（仅 `text` 类型）|
| `text_style` | TextStyle | 否 | 文本样式（仅 `text` 类型）|
| `children` | Layer[] | 否 | 子图层列表（仅 `frame / group / boolean` 类型）|

### InstanceLayer（实例图层）

`type` 固定为 `"instance"`。实例图层**不含 `children`**，也**不含** `fills`、`strokes`、`effects`、`corner_radius` 等外观字段，内容由库在运行时提供。

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `instance` | CloudInstanceRef | 是 | 云端组件引用数据 |

---

## CloudInstanceRef

所有实例图层均视为云端组件实例。`variant_key` 或 `component_set_key` 为空时，解析器应直接报错。

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `symbol_id` | string | 是 | 变体 SYMBOL 的 GUID，格式 `"sessionID:localID"`。转换时与组件集 hex 中查到的 GUID 做校验，不一致则以库为准并更新 |
| `variant_key` | string | 是 | 变体的 `componentKey`（该 SYMBOL 的全局唯一 hash）|
| `component_set_key` | string | 是 | 所属组件集的 `componentKey`；若该组件无父组件集，则与 `variant_key` 相同 |
| `component_set_resolved` | boolean | 是 | 本地库是否已成功解析该组件集，默认为 `true`。`false` 表示组件集 key 存在但对应库文件当前不可用，`dsl-to-hex` 转换时将降级处理 |
| `path` | string | 是 | 组件集 hex 文件相对组件库根目录（`HEX_LIB_DIR`）的路径，格式 `"{source}/{hexFile}"`，如 `"ICT_UI/component/9a9da828027b6bdc773731bb333817c0799c208d.txt"`。来自 component-service 匹配结果中的 `path` 字段，原样写入即可。`dsl-to-hex` 转换时直接拼接 `HEX_LIB_DIR + path` 读取本地 hex 文件，不再请求 component-service |
| `variant_props` | object | 否 | 变体属性键值对；key 格式由组件库定义，可为中文或英文，如 `{"status": "primary", "size": "normal"}` 或 `{"状态": "Pressed", "尺寸": "Medium"}` |
| `overrides` | InstanceOverride[] | 否 | 实例级属性覆写列表 |

### InstanceOverride

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `node_id` | string | 是 | 被覆写的子节点 GUID |
| `field` | string | 是 | 覆写的字段名，如 `"text_content"` / `"visible"` / `"fills"` |
| `value` | any | 是 | 覆写的值，类型与 `field` 对应 |

---

## BoundingBox

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `x` | number | 是 | 相对父节点的 X 偏移（来自 transform.m02）|
| `y` | number | 是 | 相对父节点的 Y 偏移（来自 transform.m12）|
| `width` | number | 是 | 宽度 |
| `height` | number | 是 | 高度 |

---

## AutoLayout

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `direction` | string | 是 | `"horizontal"` / `"vertical"` |
| `gap` | number | 是 | 主轴间距 |
| `counter_gap` | number | 否 | 交叉轴间距（仅 `wrap: true` 时有效）|
| `padding` | number[4] | 是 | 内边距 `[top, right, bottom, left]` |
| `align_items` | string | 是 | 交叉轴对齐：`"min"` / `"center"` / `"max"` / `"stretch"` |
| `justify_content` | string | 是 | 主轴对齐：`"min"` / `"center"` / `"max"` / `"space_evenly"` |
| `wrap` | boolean | 是 | 是否换行 |

---

## Fill / Stroke

Fill 和 Stroke 字段结构基本相同，但 Stroke 不支持 `image` 类型，`image_hash` 字段仅对 Fill 有效。

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `type` | string | 是 | Fill：`"solid"` / `"gradient_linear"` / `"gradient_radial"` / `"image"`；Stroke：`"solid"` / `"gradient_linear"` / `"gradient_radial"` |
| `visible` | boolean | 是 | 是否可见 |
| `opacity` | number | 是 | 填充/描边透明度 |
| `color` | string | 否 | HEX 颜色（仅 `solid`），如 `"#FF5733FF"`（含 Alpha）|
| `stops` | ColorStop[] | 否 | 渐变色标（仅渐变类型），见 [ColorStop](#colorstop) |
| `image_hash` | string | 否 | 图片 hash（仅 Fill `image` 类型，Stroke 不支持）|

---

## ColorStop

渐变色标，用于描述渐变填充中每个颜色节点的位置和颜色。

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `color` | string | 是 | HEX 颜色（含 Alpha），如 `"#1677FFFF"` |
| `position` | number | 是 | 色标位置，范围 `0`~`1`（`0` 为起点，`1` 为终点）|

---

## Effect

效果列表用于添加阴影、模糊等视觉效果。

**注意：Effect 字段当前未完整实现，详细信息如下：**

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `type` | string | 是 | `"drop_shadow"` / `"inner_shadow"` / `"layer_blur"` / `"foreground_blur"` |
| `visible` | boolean | 是 | 是否可见 |
| `offset_x` | number | 否 | 阴影 X 偏移（仅阴影类型）|
| `offset_y` | number | 否 | 阴影 Y 偏移（仅阴影类型）|
| `blur` | number | 是 | 模糊半径/阴影模糊半径 |
| `spread` | number | 否 | 阴影扩散（仅阴影类型）|
| `color` | string | 否 | HEX 颜色（含 Alpha，仅阴影类型）|

**完整 Effect 结构待补充，当前仅支持基本阴影效果。**

---

## TextStyle

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `font_family` | string | 是 | 字体名称 |
| `font_style` | string | 是 | 字重/样式，如 `"Regular"` / `"Bold"` / `"Medium"` |
| `font_size` | number | 是 | 字号（px）|
| `color` | string | 是 | 文字颜色（HEX + Alpha）|
| `letter_spacing` | number | 是 | 字间距 |
| `line_height` | number \| string | 是 | 行高（px 或 `"auto"`）|
| `align_h` | string | 是 | 水平对齐：`"left"` / `"center"` / `"right"` / `"justified"` |
| `align_v` | string | 是 | 垂直对齐：`"top"` / `"center"` / `"bottom"` |

---

## LayerType

| 值 | 说明 |
|---|---|
| `frame` | 容器帧（对应 Pixso FRAME）|
| `group` | 编组（对应 GROUP）|
| `rectangle` | 矩形 |
| `ellipse` | 椭圆 |
| `vector` | 矢量路径 |
| `star` | 星形 |
| `line` | 直线 |
| `boolean` | 布尔运算组合（BOOLEAN_OPERATION）|
| `text` | 文本 |
| `instance` | 云端组件实例（INSTANCE）|
| `table` | 表格（需配合表格模版 hex 使用）|

---

## TableLayer（表格图层）

`type` 为 `"table"` 时，图层包含一个 `table` 字段描述表格结构。表格的视觉样式（边框、背景色、字体等）由外部传入的表格模版 hex 决定，DSL 只负责描述数据和尺寸。

### table 字段

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `col_width` | number | 否 | 每列宽度（px）。为 `0` 时自动按 `box.width / 列数` 均分 |
| `row_height` | number | 否 | 数据行高（px）。为 `0` 时沿用模版默认值 |
| `header_height` | number | 否 | 表头行高（px）。为 `0` 时沿用模版默认值 |
| `headers` | (string \| Layer)[] | 是 | 列头描述列表，长度决定列数。元素为 `string` 时渲染为纯文本；为 `Layer` 时按图层类型渲染（支持 `text` / `frame` / `instance` 等），规则与单元格完全相同 |
| `rows` | Layer[][] | 是 | 数据行列表，每行是一个 `Layer` 数组（每格一个完整图层，支持 text / frame / instance 等任意类型）|

### 尺寸优先级

```
col_width > 0          → 使用 DSL 指定值
col_width = 0          → box.width / 列数（自动均分）
box.width 也为 0       → 使用模版默认列宽
```

`row_height` 和 `header_height` 同理，无法从 `box.height` 自动推算（因为行数不固定），为 `0` 时直接使用模版默认值。

### 约束

- 表格图层**不含 `children` 字段**，单元格内容通过 `rows` 传入
- 每格（cell）是一个完整的 `Layer`，其 `id` 字段作为该节点的 GUID 写入 hex
- 表格视觉风格完全由 `--table-template` 指定的 hex 文件控制；若未传入模版，表格节点将被替换为一个不可见的占位 FRAME

### 示例

表头为「应用名称 / 状态图标 / 版本号 / 操作」，第一行数据演示三种单元格类型：纯文本、图标 instance、带图标的 frame 组合。

```json
{
  "id": "7:1",
  "name": "应用列表表格",
  "type": "table",
  "visible": true,
  "opacity": 1,
  "blend_mode": "normal",
  "box": { "x": 40, "y": 200, "width": 960, "height": 280 },
  "table": {
    "col_width": 0,
    "row_height": 48,
    "header_height": 48,
    "headers": ["应用名称", "状态", "版本号", "操作"],
    "rows": [
      [
        {
          "id": "10:1", "name": "cell-1-name", "type": "text",
          "visible": true, "opacity": 1, "blend_mode": "normal",
          "box": { "x": 0, "y": 0, "width": 240, "height": 48 },
          "text_content": "设计协作平台",
          "text_style": {
            "font_family": "PingFang SC", "font_style": "Regular",
            "font_size": 14, "color": "#1E293BFF",
            "letter_spacing": 0, "line_height": 48,
            "align_h": "left", "align_v": "center"
          }
        },
        {
          "id": "10:2", "name": "cell-1-status", "type": "instance",
          "visible": true, "opacity": 1, "blend_mode": "normal",
          "box": { "x": 0, "y": 0, "width": 240, "height": 48 },
          "instance": {
            "symbol_id": "4718:41109",
            "variant_key": "3c14e47dd7957399dd4b4264a5bcc15785468009",
            "component_set_key": "37a280c2bb780fa3751115c93658294048481a7c",
            "component_set_resolved": true,
            "path": "ICT_UI/component/37a280c2bb780fa3751115c93658294048481a7c.txt",
            "variant_props": { "_color": "success绿色", "size": "normal" },
            "overrides": []
          }
        },
        {
          "id": "10:3", "name": "cell-1-version", "type": "text",
          "visible": true, "opacity": 1, "blend_mode": "normal",
          "box": { "x": 0, "y": 0, "width": 240, "height": 48 },
          "text_content": "v2.4.1",
          "text_style": {
            "font_family": "PingFang SC", "font_style": "Regular",
            "font_size": 14, "color": "#595959FF",
            "letter_spacing": 0, "line_height": 48,
            "align_h": "left", "align_v": "center"
          }
        },
        {
          "id": "10:4", "name": "cell-1-action", "type": "frame",
          "visible": true, "opacity": 1, "blend_mode": "normal",
          "box": { "x": 0, "y": 0, "width": 240, "height": 48 },
          "auto_layout": {
            "direction": "horizontal", "gap": 8,
            "padding": [10, 0, 10, 0],
            "align_items": "center", "justify_content": "min", "wrap": false
          },
          "children": [
            {
              "id": "10:5", "name": "action-edit-icon", "type": "instance",
              "visible": true, "opacity": 1, "blend_mode": "normal",
              "box": { "x": 0, "y": 0, "width": 24, "height": 24 },
              "instance": {
                "symbol_id": "4280:102991",
                "variant_key": "1db35593ea9d14e17bb6b886364e66f9dd82fabc",
                "component_set_key": "9a9da828027b6bdc773731bb333817c0799c208d",
                "component_set_resolved": true,
                "path": "ICT_UI/component/9a9da828027b6bdc773731bb333817c0799c208d.txt",
                "variant_props": { "status": "primary", "size": "small", "disabled": "false" },
                "overrides": []
              }
            },
            {
              "id": "10:6", "name": "action-edit-label", "type": "text",
              "visible": true, "opacity": 1, "blend_mode": "normal",
              "box": { "x": 0, "y": 0, "width": 28, "height": 24 },
              "text_content": "编辑",
              "text_style": {
                "font_family": "PingFang SC", "font_style": "Regular",
                "font_size": 14, "color": "#1677FFFF",
                "letter_spacing": 0, "line_height": 24,
                "align_h": "left", "align_v": "center"
              }
            }
          ]
        }
      ]
    ]
  }
}
```

### 示例二：富文本表头 + 富内容单元格

表头最后一列为「设置图标 + 设置文本」组合，第一列为纯文本「状态」；数据行第一列为「小绿圆图标 + 活着文本」，最后一列为「编辑图标 + 复制图标」。

```json
{
  "id": "7:2",
  "name": "服务列表表格",
  "type": "table",
  "visible": true,
  "opacity": 1,
  "blend_mode": "normal",
  "box": { "x": 40, "y": 200, "width": 960, "height": 280 },
  "table": {
    "col_width": 0,
    "row_height": 48,
    "header_height": 48,
    "headers": [
      "状态",
      "服务名称",
      "版本号",
      {
        "id": "20:1", "name": "header-action", "type": "frame",
        "visible": true, "opacity": 1, "blend_mode": "normal",
        "box": { "x": 0, "y": 0, "width": 240, "height": 48 },
        "auto_layout": {
          "direction": "horizontal", "gap": 6,
          "padding": [0, 0, 0, 16],
          "align_items": "center", "justify_content": "min", "wrap": false
        },
        "children": [
          {
            "id": "20:2", "name": "header-setting-icon", "type": "instance",
            "visible": true, "opacity": 1, "blend_mode": "normal",
            "box": { "x": 0, "y": 0, "width": 16, "height": 16 },
            "instance": {
              "symbol_id": "4280:10001",
              "variant_key": "aabbcc11223344556677889900aabbcc11223344",
              "component_set_key": "9a9da828027b6bdc773731bb333817c0799c208d",
              "component_set_resolved": true,
              "path": "ICT_UI/component/9a9da828027b6bdc773731bb333817c0799c208d.txt",
              "variant_props": { "name": "setting", "size": "16" },
              "overrides": []
            }
          },
          {
            "id": "20:3", "name": "header-setting-label", "type": "text",
            "visible": true, "opacity": 1, "blend_mode": "normal",
            "box": { "x": 0, "y": 0, "width": 56, "height": 48 },
            "text_content": "设置",
            "text_style": {
              "font_family": "PingFang SC", "font_style": "Regular",
              "font_size": 14, "color": "#1E293BFF",
              "letter_spacing": 0, "line_height": 48,
              "align_h": "left", "align_v": "center"
            }
          }
        ]
      }
    ],
    "rows": [
      [
        {
          "id": "21:1", "name": "cell-1-status", "type": "frame",
          "visible": true, "opacity": 1, "blend_mode": "normal",
          "box": { "x": 0, "y": 0, "width": 240, "height": 48 },
          "auto_layout": {
            "direction": "horizontal", "gap": 6,
            "padding": [0, 0, 0, 16],
            "align_items": "center", "justify_content": "min", "wrap": false
          },
          "children": [
            {
              "id": "21:2", "name": "status-dot", "type": "ellipse",
              "visible": true, "opacity": 1, "blend_mode": "normal",
              "box": { "x": 0, "y": 0, "width": 8, "height": 8 },
              "fills": [{ "type": "solid", "visible": true, "opacity": 1, "color": "#52C41AFF" }]
            },
            {
              "id": "21:3", "name": "status-label", "type": "text",
              "visible": true, "opacity": 1, "blend_mode": "normal",
              "box": { "x": 0, "y": 0, "width": 28, "height": 48 },
              "text_content": "活着",
              "text_style": {
                "font_family": "PingFang SC", "font_style": "Regular",
                "font_size": 14, "color": "#52C41AFF",
                "letter_spacing": 0, "line_height": 48,
                "align_h": "left", "align_v": "center"
              }
            }
          ]
        },
        {
          "id": "21:4", "name": "cell-1-name", "type": "text",
          "visible": true, "opacity": 1, "blend_mode": "normal",
          "box": { "x": 0, "y": 0, "width": 240, "height": 48 },
          "text_content": "设计协作平台",
          "text_style": {
            "font_family": "PingFang SC", "font_style": "Regular",
            "font_size": 14, "color": "#1E293BFF",
            "letter_spacing": 0, "line_height": 48,
            "align_h": "left", "align_v": "center"
          }
        },
        {
          "id": "21:5", "name": "cell-1-version", "type": "text",
          "visible": true, "opacity": 1, "blend_mode": "normal",
          "box": { "x": 0, "y": 0, "width": 240, "height": 48 },
          "text_content": "v2.4.1",
          "text_style": {
            "font_family": "PingFang SC", "font_style": "Regular",
            "font_size": 14, "color": "#595959FF",
            "letter_spacing": 0, "line_height": 48,
            "align_h": "left", "align_v": "center"
          }
        },
        {
          "id": "21:6", "name": "cell-1-action", "type": "frame",
          "visible": true, "opacity": 1, "blend_mode": "normal",
          "box": { "x": 0, "y": 0, "width": 240, "height": 48 },
          "auto_layout": {
            "direction": "horizontal", "gap": 16,
            "padding": [0, 0, 0, 16],
            "align_items": "center", "justify_content": "min", "wrap": false
          },
          "children": [
            {
              "id": "21:7", "name": "action-edit-icon", "type": "instance",
              "visible": true, "opacity": 1, "blend_mode": "normal",
              "box": { "x": 0, "y": 0, "width": 16, "height": 16 },
              "instance": {
                "symbol_id": "4280:10002",
                "variant_key": "1db35593ea9d14e17bb6b886364e66f9dd82fabc",
                "component_set_key": "9a9da828027b6bdc773731bb333817c0799c208d",
                "component_set_resolved": true,
                "path": "ICT_UI/component/9a9da828027b6bdc773731bb333817c0799c208d.txt",
                "variant_props": { "name": "edit", "size": "16" },
                "overrides": []
              }
            },
            {
              "id": "21:8", "name": "action-copy-icon", "type": "instance",
              "visible": true, "opacity": 1, "blend_mode": "normal",
              "box": { "x": 0, "y": 0, "width": 16, "height": 16 },
              "instance": {
                "symbol_id": "4280:10003",
                "variant_key": "cc9d14e47dd7957399dd4b4264a5bcc157854680",
                "component_set_key": "9a9da828027b6bdc773731bb333817c0799c208d",
                "component_set_resolved": true,
                "path": "ICT_UI/component/9a9da828027b6bdc773731bb333817c0799c208d.txt",
                "variant_props": { "name": "copy", "size": "16" },
                "overrides": []
              }
            }
          ]
        }
      ]
    ]
  }
}
```

---

## BlendMode

值参考 Pixso BlendMode 枚举，小写下划线格式，如：
`normal` / `multiply` / `screen` / `overlay` / `darken` / `lighten` / `color_dodge` / `color_burn` 等。

---

## 完整示例

```json
{
  "meta": {
    "version": "1.0.0",
    "source": "pixso",
    "file_id": "file-abc123",
    "file_name": "HarmonyOS 设计稿",
    "created_at": "2026-06-01T00:00:00Z",
    "updated_at": "2026-06-01T12:00:00Z"
  },
  "pages": [
    {
      "id": "0:1",
      "name": "页面 1",
      "layers": [
        {
          "id": "8:1",
          "name": "容器",
          "type": "frame",
          "visible": true,
          "opacity": 1,
          "blend_mode": "normal",
          "box": { "x": 0, "y": 0, "width": 375, "height": 200 },
          "fills": [{ "type": "solid", "visible": true, "opacity": 1, "color": "#FFFFFFFF" }],
          "auto_layout": {
            "direction": "horizontal",
            "gap": 12,
            "padding": [16, 16, 16, 16],
            "align_items": "center",
            "justify_content": "min",
            "wrap": false
          },
          "children": [
            {
              "id": "9:49",
              "name": "标题文本",
              "type": "text",
              "visible": true,
              "opacity": 1,
              "blend_mode": "normal",
              "box": { "x": 16, "y": 16, "width": 200, "height": 24 },
              "text_content": "用户名",
              "text_style": {
                "font_family": "HarmonyOS Sans",
                "font_style": "Bold",
                "font_size": 16,
                "color": "#1A1A1AFF",
                "letter_spacing": 0,
                "line_height": "auto",
                "align_h": "left",
                "align_v": "center"
              }
            },
            {
              "id": "10:28",
              "name": "图标按钮",
              "type": "instance",
              "visible": true,
              "opacity": 1,
              "blend_mode": "normal",
              "box": { "x": 228, "y": 16, "width": 40, "height": 40 },
              "instance": {
                "symbol_id": "10:30",
                "variant_key": "549fdf93a10fec402c93432a2e228e407ccc2954",
                "component_set_key": "ecb8481025909ec9371c3b25104bb8b7c1079224",
                "component_set_resolved": true,
                "path": "h-design-chart/component/ecb8481025909ec9371c3b25104bb8b7c1079224.txt",
                "variant_props": { "尺寸": "40" },
                "overrides": []
              }
            }
          ]
        }
      ]
    }
  ]
}
```

---

## PlaceholderMeta

占位符标记数据，用于标记需要替换为 SVG 或图片资源的图层。仅 SVG 和图片类型的图层会使用占位符。placeholder 数据会写入 Pixso 文件的 pluginData 字段，便于后续处理。

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `is_placeholder` | boolean | 是 | 是否为占位符 |
| `replacement_type` | `"svg"` \| `"image"` | 是 | 替换类型：<br>• `"svg"` - 矢量 SVG 资源<br>• `"image"` - 图片资源 |
| `note` | string | 否 | DSL 中存放原始 SVG 字符串或图片 base64 内容；`dsl-to-hex` 转换时会将其提取为独立资源文件并写入 zip，hex 中对应位置替换为文件名（格式 `{guid}.svg` / `{guid}.png`，guid = 图层 id 冒号替换为下划线）|

**pluginData 写入规则**：
- 当图层包含 `placeholder` 字段时，解析器会将其写入 PixsoNode 的 pluginData 数组
- pluginID：`"pix-dsl"`
- key：`"placeholder_meta"`
- value：JSON 字符串格式，包含上述三个字段（`note` 此时已替换为资源文件名）

**示例**：
```json
{
  "id": "1:14",
  "name": "眼睛图标",
  "type": "rectangle",
  "placeholder": {
    "is_placeholder": true,
    "replacement_type": "svg",
    "note": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 20 20\">...</svg>"
  },
  "box": { "x": 404, "y": 372, "width": 20, "height": 20 }
}
```
