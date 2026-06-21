# variant_props → pluginData 写入说明

## DSL JSON 示例

```json
{
  "pages": [{
    "id": "0:1",
    "name": "页面1",
    "layers": [{
      "name": "按钮",
      "type": "instance",
      "box": { "x": 0, "y": 0, "width": 120, "height": 40 },
      "instance": {
        "symbol_id": "100:1",
        "variant_key": "abc111",
        "component_set_key": "comp-set-A",
        "path": "ict-ui/component/comp-set-A.txt",
        "variant_props": {
          "status": "primary",
          "disabled": false,
          "icon": {
            "type": "instance",
            "instance": {
              "symbol_id": "200:1",
              "variant_key": "def222",
              "component_set_key": "comp-set-B",
              "path": "ict-ui/component/comp-set-B.txt"
            }
          }
        }
      }
    }]
  }]
}
```

---

## 产出节点与 pluginData

### 节点一：按钮实例（可见）

父节点：页面 canvas `{0,1}`，`visible: true`

`symbolData.symbolID` = `{100, 1}`

`symbolData.symbolOverrides[0]`（variant_props 槽）：
```json
{
  "guidPath": { "guids": [{ "sessionID": 100, "localID": 1 }] },
  "pluginData": [{
    "pluginID": "pix-dsl",
    "key": "variant_props",
    "value": "{\"status\":\"primary\",\"disabled\":false,\"icon\":{\"variant_key\":\"def222\"}}"
  }]
}
```

> `guidPath` 填 symbolID 本身。value 是所有 variant_props 的 JSON 序列化：
> - 普通值直接序列化
> - instance 值只保留 `variant_key`

---

### 节点二：icon 隐藏实例（自动生成）

父节点：页面 canvas `{0,1}`，**`visible: false`**

`symbolData.symbolID` = `{200, 1}`

`symbolData.symbolOverrides[0]`：
```json
{
  "guidPath": { "guids": [{ "sessionID": 200, "localID": 1 }] },
  "pluginData": [{
    "pluginID": "pix-dsl",
    "key": "instance_swap",
    "value": "def222"
  }]
}
```

> value 直接是该 instance 的 `variant_key` 原始字符串。
> 此节点仅为保留组件 hex 数据不被清除，不参与布局。

---

## pluginData key 汇总

| key | 写在哪 | 含义 |
|-----|--------|------|
| `placeholder_meta` | 节点 `pluginData` | SVG/图片占位元数据 |
| `variant_props` | 实例 `symbolOverrides[0].pluginData` | 该实例的全量属性 JSON |
| `instance_swap` | 隐藏实例 `symbolOverrides[0].pluginData` | variant_props 里 instance 值的 variant_key |
