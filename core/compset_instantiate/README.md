# compset_instantiate

从 `component_index.json` + hex 组件集文件，为每个变体 / 独立组件生成独立 `.txt` 文件，并输出包含宽高信息的 `variants.json`。

## 背景

`split_compset` 工具将 `.pix` 组件库拆分后会输出：
- `component/component_index.json` — 组件集索引，含 `componentSets`（变体集）和 `standaloneComponents`（独立组件）
- `component/<key>.txt` — 每个组件的 hex 二进制

本工具读取上述输出，为每个变体 / 独立组件创建一个 INSTANCE 节点，生成独立 hex 文件，并同步输出包含 key / 宽 / 高的 `variants.json`，可直接导入 Pixso。

## 快速开始

```bash
# 指定组件集，输出 hex + variants.json
node index.js \
  ../split_compset/wasm_test_out/component/component_index.json \
  ../split_compset/wasm_test_out \
  "文字链接"

# 同时处理多个组件
node index.js component_index.json base_dir "文字链接" "2.拖拽把手"

# 不传名称 = 处理全部（分批，每批默认 20 个组件）
node index.js component_index.json base_dir

# 只输出 variants.json，不生成 hex 文件（更快）
node index.js component_index.json base_dir --json-only

# 只重跑缺失的变体（上次失败后补跑）
node index.js component_index.json base_dir --retry

# 其他选项
node index.js component_index.json base_dir --outdir /tmp/instances --batch 10
```

## 命令格式

```
node index.js <component_index.json> <base_dir> [名称过滤...] [--outdir <dir>] [--batch <n>] [--json-only] [--retry]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `component_index.json` | ✓ | 索引文件路径（`split_compset` 生成） |
| `base_dir` | ✓ | hex 源文件基准目录，`hexFile` 字段相对于此目录解析 |
| `[名称过滤...]` | — | 按 `name` 字段过滤，同时匹配 componentSets 和 standaloneComponents；不传则处理全部 |
| `--outdir <dir>` | — | 输出目录；默认 `core/compset_instantiate/output/` |
| `--batch <n>` | — | 每批处理的组件数量；默认 20 |
| `--json-only` | — | 只收集宽高元数据并输出 `variants.json`，跳过 hex 构建和写入 |
| `--retry` | — | 自动对比 outdir 与 index，只重跑缺失的变体 |

## 输出文件结构

```
output/
  <variantKey>.txt       ← componentSets 变体（variantKey 非空时）
  <componentKey>.txt     ← standaloneComponents（componentKey 非空时）
  <guidS>_<guidL>.txt    ← key 为空时的 fallback（旧格式索引）
  variants.json          ← 所有变体的 key / name / width / height 汇总（始终输出）
  failed.log             ← 失败条目记录（有失败时才生成）
```

### variants.json 格式

```json
[
  { "key": "8229_277395", "name": "status=independent, size=normal", "width": 72,  "height": 22 },
  { "key": "9203_301533", "name": "2.拖拽把手",                      "width": 24, "height": 1080 }
]
```

## 文件名 key 规则

| 来源 | 有 key | 无 key（旧格式） |
|------|--------|-----------------|
| `componentSets` 变体 | `variant.variantKey` | `{guidS}_{guidL}` |
| `standaloneComponents` | `standalone.componentKey` | `{guidS}_{guidL}` |

`variantKey` / `componentKey` 由 Pixso 平台生成，全局唯一，可直接用作文件名。

## 每个 hex 文件的内部结构

```
CANVAS {0,1}  "<变体名>"             ← 可见画布
  INSTANCE {dslSession,1}            ← 该变体唯一的实例节点
CANVAS {0,2}  "Internal Only Canvas" ← 组件库挂载点（隐藏）
  SYMBOL / FRAME / TEXT / ...        ← 该组件集的完整定义节点
```

每个文件**自包含**：组件定义完整包含在内，无需额外依赖。

## 失败处理

```bash
# 查看哪些变体缺失
node check.js component_index.json output

# 重跑所有缺失的变体
node index.js component_index.json base_dir --retry --outdir output
```

有失败时汇总会写入 `output/failed.log`，格式：
```
[批次1] 组件名  key=xxx  原因: symbol not found
```

## 构建

### Node.js（WASM，推荐）

WASM 产物已预编译在 `bin/`，直接运行：

```bash
node index.js ...
```

如需重新编译（依赖 `~/emsdk-main`）：

```bash
make -f Makefile.wasm
```

### 原生二进制（调试用，输出单个合并 hex）

```bash
make          # 生成 bin/compset_instantiate
make test
make clean
```

## 架构说明

### WASM 函数签名

```
instantiateCompSet(indexPath, baseDir, setNames, tmpDir, jsonOnly) → JSON 数组 | error JSON
```

成功时返回小型元数据 JSON（hex 内容已由 WASM 写入 `tmpDir/<key>.txt`，或 jsonOnly=true 时不写文件）：

```json
[
  { "key": "8229_277395", "name": "status=independent...", "width": 72, "height": 22 },
  { "key": "9203_301533", "name": "2.拖拽把手", "width": 24, "height": 1080 }
]
```

WASM 将 hex 写入 ASCII 路径的临时目录（`tmp_work/`），JS 再 rename 到最终 outDir（支持 UTF-8 路径）。这样避免了两个问题：V8 字符串 536MB 上限 和 `fopen` 不支持非 ASCII 路径。

### 与 dsl_to_hex 的关系

| | dsl_to_hex | compset_instantiate |
|---|---|---|
| **输入** | DSL JSON（页面布局） | component_index.json + hex 组件集 |
| **变体来源** | DSL `instance.symbol_id` | index 的 variants / standaloneComponents |
| **输出** | 一个包含完整页面的 hex | 每个变体一个独立 hex + variants.json |
| **用途** | 设计稿转 hex | 批量预览 / 导出组件变体 |

两者共享 `dsl_to_hex/modules/` 下所有底层模块。

## 验证

```bash
node -e "
  const fs = require('fs');
  const hex = fs.readFileSync('output/8229_277395.txt', 'utf8')
    .replace(/<!--.*?-->/gs, '').replace(/\s/g, '');
  fs.writeFileSync('/tmp/check.pix', Buffer.from(hex, 'hex'));
"
node ../../pixso-parser.js /tmp/check.pix
```
