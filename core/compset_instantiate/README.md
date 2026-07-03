# compset_instantiate

从 `component_index.json` + hex 组件集文件，为每个变体生成一个独立的 `.hex` 文件。

## 背景

`split_compset` 工具将 `.pix` 组件库拆分后会输出：
- `component/component_index.json` — 组件集索引，含每个变体的名称和 GUID
- `component/<guid>.txt` — 每个组件集的 hex 二进制

本工具读取上述输出，按变体列表逐一创建 INSTANCE 节点，每个变体生成一个独立的 hex 文件，可直接导入 Pixso。

## 快速开始

```bash
# 单组件集，输出 20 个 hex 文件到 output/文字链接/
node index.js \
  ../split_compset/wasm_test_out/component/component_index.json \
  ../split_compset/wasm_test_out \
  "文字链接"

# 多个组件集同时处理
node index.js component_index.json wasm_test_out "文字链接" "1.按钮"

# 不传组件集名称 = 处理全部
node index.js component_index.json wasm_test_out

# 指定输出目录
node index.js component_index.json wasm_test_out "文字链接" --outdir /tmp/instances
```

## 命令格式

```
node index.js <component_index.json> <base_dir> [组件集名称...] [--outdir <dir>]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `component_index.json` | ✓ | 索引文件路径（`split_compset` 生成） |
| `base_dir` | ✓ | hex 文件路径基准目录，`hexFile` 字段相对于此目录解析 |
| `[组件集名称...]` | — | 过滤，仅处理这些组件集；不传则处理全部 |
| `--outdir <dir>` | — | 输出根目录；默认 `core/compset_instantiate/output/` |

## 输出文件结构

每个变体输出一个独立 hex 文件，按组件集分子目录：

```
output/
  <组件集名>/
    <变体名>.hex
    <变体名>.hex
    ...
  <另一个组件集名>/
    ...
```

示例（"文字链接" 组件集，20 个变体）：

```
output/
  文字链接/
    status=independent, Interaction=default, size=normal, disabled=false.hex
    status=inline, Interaction=default, size=normal, disabled=false.hex
    status=independent, Interaction=hover, size=normal, disabled=false.hex
    ... （共 20 个）
```

## 每个 hex 文件的内部结构

```
CANVAS {0,1}  "<变体名>"             ← 可见画布，以变体名命名
  INSTANCE {dslSession,1}            ← 该变体唯一的实例节点
CANVAS {0,2}  "Internal Only Canvas" ← 组件库挂载点（隐藏）
  SYMBOL / FRAME / TEXT / ...        ← 该组件集的全量定义节点
```

每个文件都是自包含的：组件集的定义节点完整包含在内，无需额外依赖。

## 构建

### Node.js（WASM，推荐）

WASM 产物已预编译在 `bin/`，直接运行即可：

```bash
node index.js ...
```

如需重新编译（依赖 `~/emsdk-main`）：

```bash
make -f Makefile.wasm
```

### 原生二进制（调试用）

```bash
make          # 生成 bin/compset_instantiate（输出单个合并 hex，用于调试）
make test     # 冒烟测试
make clean
```

## 架构说明

### WASM 函数签名

```
instantiateCompSet(indexPath, baseDir, setNames) → JSON 数组 | error JSON
```

成功时返回 JSON 数组，每个元素对应一个变体：

```json
[
  {
    "setName": "文字链接",
    "variantName": "status=independent, Interaction=default, size=normal, disabled=false",
    "guid": "8229:277395",
    "hex": "<!-- pixso binary data -->\n<hexdata>"
  },
  ...
]
```

JS 层负责解析数组、按 `setName`/`variantName` 确定文件路径并写入磁盘（避免 WASM `fopen` 中文路径问题）。

### 与 dsl_to_hex 的关系

| | dsl_to_hex | compset_instantiate |
|---|---|---|
| **输入** | DSL JSON（描述页面布局） | component_index.json + hex 组件集 |
| **变体来源** | DSL `instance.symbol_id` | component_index.json variants 列表 |
| **输出** | 一个包含完整页面的 hex | 每个变体一个独立 hex |
| **用途** | 设计稿转 hex | 批量预览/导出组件变体 |

两者共享 `dsl_to_hex/modules/` 下所有底层模块。

## 验证

生成的 hex 文件可用 `pixso-parser.js` 验证（需先转为原始二进制）：

```bash
node -e "
  const fs = require('fs');
  const hex = fs.readFileSync('output/文字链接/status=independent, Interaction=default, size=normal, disabled=false.hex', 'utf8')
    .replace(/<!--.*?-->/gs, '').replace(/\s/g, '');
  fs.writeFileSync('/tmp/check.pix', Buffer.from(hex, 'hex'));
"
node ../../pixso-parser.js /tmp/check.pix
```
