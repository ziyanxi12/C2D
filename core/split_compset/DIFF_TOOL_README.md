# Component Index Diff Tool

对比两个 `component_index.json` 文件，生成组件 key 映射表。

## 使用场景

同一组件库多次上传到 Pixso，每次会生成不同的 `componentKey` 和 `variantKey`（因为 GUID 变化）。此工具通过组件名称和结构建立映射，识别出相同组件。

**假设**：
- 组件名、画布名、变体名保持不变
- 只有 GUID 和 key 会变

## 使用方法

```bash
node diff_component_index.js <old_json> <new_json> <output_mapping.json>
```

### 参数

- `old_json`: 旧版本 `component_index.json` 文件路径
- `new_json`: 新版本 `component_index.json` 文件路径
- `output_mapping.json`: 输出的映射表 JSON 文件路径

### 示例

```bash
node diff_component_index.js \
  output/v1/component_index.json \
  output/v2/component_index.json \
  output/mapping.json
```

## 映射逻辑

### 稳定标识生成

**组件集**：
```
stableId = name + "::" + canvasName + "::" + sorted(variant_names).join("|")
```

**独立组件**：
```
stableId = name + "::" + canvasName
```

### 示例

```javascript
// 组件集稳定 ID
"按钮/主按钮::Components::默认|禁用|悬停"

// 独立组件稳定 ID
"图标/箭头::Components"
```

## 输出格式

```json
{
  "version": "1.0",
  "generatedAt": "2026-07-17T12:30:00Z",
  "oldFile": "component_index_v1.json",
  "newFile": "component_index_v2.json",
  
  "componentSetMappings": {
    "abc123...": "xyz789..."
  },
  
  "variantMappings": {
    "variant_abc": "variant_xyz"
  },
  
  "standaloneComponentMappings": {
    "standalone_abc": "standalone_xyz"
  },
  
  "unmatched": {
    "componentSets": {
      "oldOnly": [],
      "newOnly": []
    },
    "variants": {
      "oldOnly": [],
      "newOnly": []
    },
    "standaloneComponents": {
      "oldOnly": [],
      "newOnly": []
    }
  }
}
```

## 字段说明

| 字段 | 说明 |
|------|------|
| `componentSetMappings` | 组件集 key 映射：`oldKey → newKey` |
| `variantMappings` | 变体 key 映射：`oldKey → newKey` |
| `standaloneComponentMappings` | 独立组件 key 映射 |
| `unmatched.oldOnly` | 仅旧版本存在的组件 |
| `unmatched.newOnly` | 仅新版本存在的组件 |

## 使用示例

### 1. 生成两次上传的组件库索引

```bash
# 第一次上传
node ../dsl-to-hex/cli.js --pix library_v1.pix --output output/v1

# 第二次上传（同一组件库）
node ../dsl-to-hex/cli.js --pix library_v2.pix --output output/v2
```

### 2. 对比生成映射表

```bash
node diff_component_index.js \
  output/v1/component_index.json \
  output/v2/component_index.json \
  output/mapping_v1_to_v2.json
```

### 3. 使用映射表

```javascript
const mapping = require('./output/mapping_v1_to_v2.json');

// 查找新 key
const oldKey = 'abc123...';
const newKey = mapping.componentSetMappings[oldKey];

if (newKey) {
  console.log(`组件 key 已更新: ${oldKey} → ${newKey}`);
} else {
  console.log('组件可能已被删除');
}
```

## 注意事项

1. **组件名必须稳定**：如果组件名、画布名或变体名改变，将无法匹配
2. **变体顺序无关**：变体名称会按字母排序后再对比
3. **未匹配项**：会记录到 `unmatched` 字段，需要人工确认
4. **增量更新**：可以连续对比多个版本（v1→v2, v2→v3）

## 常见问题

### Q: 为什么有些组件匹配不上？

A: 可能原因：
- 组件名改变
- 画布名改变
- 变体名改变或删除
- 新增组件

检查 `unmatched` 字段查看详情。

### Q: 可以对比多个版本吗？

A: 可以。先对比 v1→v2，再对比 v2→v3，然后合并映射表。

### Q: 映射表可以反向查询吗？

A: 可以。`componentSetMappings` 是双向映射，可以 `oldKey → newKey` 或 `newKey → oldKey`（需要反向构建）。

## 依赖

- Node.js >= 12.0
- 无需第三方依赖（仅使用 Node.js 原生模块）