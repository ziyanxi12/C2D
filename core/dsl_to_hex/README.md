# dsl_to_hex — DSL 转 Pixso hex 工具

将设计稿 DSL（JSON 格式）转换为 Pixso 可识别的 hex 数据，支持普通图层和组件实例（INSTANCE）。

---

## 目录结构

```
dsl_to_hex/
├── dsl_core.h              # 共享核心逻辑（两个入口共用）
├── dsl_to_hex.cpp          # CLI 入口（writeFile / isDirectory / verifyPix / main）
├── dsl_to_hex_wasm.cpp     # WASM 入口（dslToHex / EMSCRIPTEN_BINDINGS）
├── Makefile                # CLI 编译
├── Makefile.wasm           # WASM 编译（需要 emsdk）
├── index.js                # WASM 调用示例（入口）
├── bin/                    # 编译产物
│   ├── dsl_to_hex          # CLI 可执行文件
│   ├── dsl_to_hex.js       # WASM JS loader
│   └── dsl_to_hex.wasm     # WASM 二进制
└── test_data/              # 测试数据
    └── login-design-dsl.json   # 测试输入：登录页 DSL
```

> **架构说明**：所有转换逻辑集中在 `dsl_core.h`，CLI 和 WASM 两个入口文件仅保留各自专用的部分。修改核心逻辑只需改 `dsl_core.h`，两个编译目标自动同步。

---

## 依赖

| 依赖 | 路径 |
|---|---|
| pixso kiwi schema | `../lib/pixso.h` |
| kiwi 库 | `../lib/kiwi-master/kiwi.h` |
| zstd 压缩库 | `../lib/zstd-1.5.6/` |
| 组件 hex 目录 | 由 `split_compset` 生成的 `../split_compset/harmony_out/component/` |

---

## 编译

### CLI

```bash
make
```

### WASM（需要 emsdk）

```bash
make -f Makefile.wasm
# 产物：dsl_to_hex.js + dsl_to_hex.wasm
```

> **注**：Makefile.wasm 中的 EMCC 路径指向 emsdk 自带的 python3，若 emsdk 安装路径不同请修改。

---

## 用法

### CLI

```bash
# 基本用法
./bin/dsl_to_hex test_data/login-design-dsl.json test_data/login_out.txt ../split_compset/harmony_out/component

# 指定输出文件
./bin/dsl_to_hex <dsl.json> <output.txt> <component_dir>
```

### WASM / Node.js

```bash
# 命令行调用（通过 index.js）
node index.js test_data/login-design-dsl.json ../split_compset/harmony_out/component

# 代码中使用
const DslToHex = require('./bin/dsl_to_hex.js');
DslToHex().then(mod => {
  const result = mod.dslToHex(
    '/abs/path/to/dsl.json',
    '/abs/path/to/component_dir'
  );
  // result: "<!-- pixso binary data -->\n{hex...}"
  // 出错时: '{"error":"..."}'
});
```

---

## 输出格式

```
<!-- pixso binary data -->
706978736f2d6b7700020d636f6d70726573733a7a7374...（hex 字符串）
```

---

## DSL 格式

DSL 格式定义见项目根目录 `../../设计dsl.md`。关键字段：

| 字段 | 说明 |
|---|---|
| `type: "instance"` | 声明为组件实例节点 |
| `instance.symbol_id` | 变体 SYMBOL 的 GUID（`sessionID:localID`）|
| `instance.component_set_key` | 组件集的 componentKey（用于定位 hex 文件）|

---

## 转换逻辑

```
DSL JSON
  ↓ 解析图层树
  ↓ 按 component_set_key 加载组件 hex
PixsoMsg 构建
  ├── CANVAS {0,1}/{0,3}/{0,4}...  可见页（每个 DSL page 一个，跳过 {0,2}）
  │    └── 图层节点（FRAME/RECT/TEXT/INSTANCE...）
  ├── CANVAS {0,2}                  隐藏页（"Internal Only Canvas"，internalOnly=true）
  │    └── 组件集全量节点（SYMBOL、FRAME 等）
  └── blobs[]                       各组件集 blob 顺序拼接，按偏移量重映射下标
```

**组件集节点写入规则**：
- 全局 GUID 去重（`writtenGuids`），防止多组件集内嵌的共享子组件重复写入
- 组件集内的 CANVAS 节点一律跳过，不写入输出
- parent 不在本组件集内的根节点（孤根）自动改挂到隐藏页 `{0,2}`

**INSTANCE 节点特殊处理**：
- `visible / opacity / blendMode` 从 DSL 读取并写入
- `size` 优先使用 SYMBOL 自身尺寸，DSL box 仅兜底
- `derivedSymbolData` 每个槽位填入完整 `guidPath`（从 SYMBOL 根到后代节点的 GUID 链），Pixso 靠此定位嵌套实例
- `symbolData.symbolID` 直接赋值 DSL 的 `symbol_id` GUID