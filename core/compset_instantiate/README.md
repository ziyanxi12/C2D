# compset_instantiate

从 `component_index.json` + hex 组件集文件，为每个变体生成对应的 INSTANCE 节点，输出为 Pixso 可识别的 `.hex` 文件。

## 背景

`split_compset` 工具将 `.pix` 组件库拆分后会输出：
- `component/component_index.json` — 组件集索引，含每个变体的名称和 GUID
- `component/<guid>.txt` — 每个组件集的 hex 二进制

本工具读取上述输出，按变体列表创建 INSTANCE 节点，生成的 hex 文件可直接导入 Pixso，用于组件预览或批量展示。

## 快速开始

```bash
# 单组件集（hex 默认输出到 output/文字链接_instances.hex）
node index.js \
  ../split_compset/wasm_test_out/component/component_index.json \
  ../split_compset/wasm_test_out \
  "文字链接"

# 多个组件集
node index.js component_index.json wasm_test_out "文字链接" "1.按钮"

# 全部组件集（不传名称）→ output/all_instances.hex
node index.js component_index.json wasm_test_out

# 指定输出路径
node index.js component_index.json wasm_test_out "文字链接" --output /path/to/result.hex
```

## 命令格式

```
node index.js <component_index.json> <base_dir> [组件集名称...] [--output <out.hex>]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `component_index.json` | ✓ | 索引文件路径（`split_compset` 生成） |
| `base_dir` | ✓ | hex 文件路径基准目录，`hexFile` 字段相对于此目录解析 |
| `[组件集名称...]` | — | 过滤，仅处理这些组件集；不传则处理全部 |
| `--output <out.hex>` | — | 输出路径；不传则自动命名，放到 `output/` 目录 |

## 输出文件位置

默认输出到 `core/compset_instantiate/output/`，文件名规则：

| 情况 | 输出文件名 |
|------|------------|
| 指定单个组件集 | `<组件集名>_instances.hex` |
| 指定多个组件集 | `<N>sets_instances.hex` |
| 未指定（全部） | `all_instances.hex` |

使用 `--output` 可覆盖到任意路径（支持中文路径）。

## 输出 hex 结构

生成的 hex 解码后包含以下节点：

```
CANVAS {0,1}  "组件实例预览"          ← 可见画布
  INSTANCE {session,1}  "<变体名>"    ← 每个变体一个实例
  INSTANCE {session,2}  "<变体名>"
  ...
CANVAS {0,2}  "Internal Only Canvas"  ← 组件库挂载点（隐藏）
  SYMBOL  <组件集内所有节点>
  FRAME
  TEXT
  ...
```

- INSTANCE 节点按 4 列网格排布，列宽 / 行高取所有变体的最大尺寸 + 20px 间距
- 每个 INSTANCE 的 `symbolID` 指向对应 SYMBOL 的 GUID
- `derivedSymbolData` 完整填充，Pixso 用它定位后代节点
- 多组件集时全局 GUID 去重，共享子组件只写入一次

## 构建

### Node.js（WASM，推荐）

WASM 产物已预编译在 `bin/`，直接 `node index.js` 即可运行。

如需重新编译：

```bash
make -f Makefile.wasm
```

依赖：`~/emsdk-main`（Emscripten SDK）

### 原生二进制（调试用）

```bash
make          # 生成 bin/compset_instantiate
make test     # 用 wasm_test_out 数据跑一次冒烟测试
make clean
```

依赖：clang++ 17+

## 与 dsl_to_hex 的关系

| | dsl_to_hex | compset_instantiate |
|---|---|---|
| **输入** | DSL JSON（描述页面布局） | component_index.json + hex 组件集 |
| **变体来源** | DSL 中 `instance.symbol_id` 字段 | component_index.json 的 variants 列表 |
| **用途** | 将设计稿转为 hex | 批量展示组件集的所有变体 |
| **INSTANCE 创建** | 由 DSL 图层驱动 | 由变体列表驱动 |

两者共享 `dsl_to_hex/modules/` 下的全部底层模块（`comp_set.h`、`symbol_helpers.h`、`blob_helpers.h` 等）。

## 验证

生成的 hex 文件可用 `pixso-parser.js` 验证（需先转换为原始二进制）：

```bash
node -e "
  const fs = require('fs');
  const hex = fs.readFileSync('output/文字链接_instances.hex', 'utf8')
    .replace(/<!--.*?-->/gs, '').replace(/\s/g, '');
  fs.writeFileSync('/tmp/check.pix', Buffer.from(hex, 'hex'));
"
node ../../pixso-parser.js /tmp/check.pix
```
