# split_compset — Pixso 组件库拆解工具

将 Pixso 组件库 `.pix` 文件按组件集拆解，每个组件集输出一个独立的 hex 文本文件，携带完整 blob 几何数据，自洽可用。

---

## 目录结构

```
split_compset/
├── split_compset.cpp       # 拆解工具主源码
├── split_compset_wasm.cpp  # WASM 入口
├── split_compset_core.h    # 共享核心逻辑
├── Makefile                # CLI 编译
├── Makefile.wasm           # WASM 编译（需要 emsdk）
├── index.js                # WASM 调用示例（入口）
├── lib/                    # 组件库文件
│   └── ICT UI_v3.1.1_PC端组件库（新）.pix afjOn7hyzf2VU3qG1CpN7Q
├── bin/                    # 编译产物
│   └── split_compset       # CLI 可执行文件
└── harmony_out/            # 拆解输出目录
    └── component/
        ├── component_index.json        # 组件索引文件
        ├── eb2f5b3bde54280c4c2a...txt  # 组件集 hex 文件
        └── ...（按 componentKey 命名的 hex 文件）
```

---

## 依赖

| 依赖 | 路径 |
|---|---|
| pixso kiwi schema | `../lib/pixso.h` |
| kiwi 库头文件 | `../lib/kiwi-master/kiwi.h` |
| zstd 压缩库 | `../lib/zstd-1.5.6/` |

---

## 编译

### CLI

```bash
make
```

### WASM（需要 emsdk）

```bash
make -f Makefile.wasm
# 产物：split_compset.js + split_compset.wasm
```

---

## 用法

### CLI

```bash
# 查看拆解报告（组件集列表及统计）
./bin/split_compset report lib/ICT\ UI_v3.1.1_PC端组件库（新）.pix

# 拆解 + 生成索引（推荐）
./bin/split_compset build_index lib/ICT\ UI_v3.1.1_PC端组件库（新）.pix harmony_out

# 仅拆解，不生成索引
./bin/split_compset dump lib/ICT\ UI_v3.1.1_PC端组件库（新）.pix harmony_out

# 打印指定序号组件集的 hex
./bin/split_compset hex lib/ICT\ UI_v3.1.1_PC端组件库（新）.pix <index>
```

### WASM / Node.js

```bash
# 命令行调用（通过 index.js）
node index.js "lib/ICT UI_v3.1.1_PC端组件库（新）.pix" harmony_out

# 代码中使用
const SplitCompset = require('./bin/split_compset.js');
SplitCompset().then(mod => {
  const result = mod.splitCompset(
    '/abs/path/to/complib.pix',
    '/abs/path/to/output_dir',
    ''  # publishFile（可选）
  );
  // result: JSON string with component list
});
```

---

## 输出格式

### hex 文件

```
<!-- pixso binary data -->
706978736f2d6b7700020d636f6d70726573733a7a7374...（hex 字符串）
```

**文件命名**：
- 有 componentKey：`{componentKey}.txt`（40 位 SHA1 hex）
- 无 componentKey（未发布）：`{sessionID}_{localID}.txt`

### component_index.json

```json
{
  "componentSets": [
    {
      "name": ".Button Group",
      "guid": "58:36444",
      "componentKey": "7c366910bf8bc5d84d5ca1a3425f2a2e00ccc3af",
      "canvasName": "6. Container 容器类",
      "hexFile": "component/7c366910bf8bc5d84d5ca1a3425f2a2e00ccc3af.txt",
      "variants": [
        {
          "name": "类型=normal,个数=1",
          "guid": "1:11558",
          "variantKey": "6eb1d8c841e4289f559d238d1d6a0b22e48acb18",
          "parentKey": "7c366910bf8bc5d84d5ca1a3425f2a2e00ccc3af"
        }
      ]
    }
  ],
  "standaloneComponents": [
    {
      "name": ".close btn",
      "guid": "1:11823",
      "componentKey": "35e66a1862dab56af99b09de8bc5ddaf9a3966c5",
      "canvasName": "6. Container 容器类",
      "hexFile": "component/35e66a1862dab56af99b09de8bc5ddaf9a3966c5.txt"
    }
  ]
}
```

---

## 拆解逻辑

1. 解析 `.pix` 文件（zstd 解压 → kiwi 解码 → PixsoMsg）
2. 遍历所有可见 CANVAS 页面
3. 以每个页面的直接子节点（SECTION / SYMBOL / FRAME+isStateGroup）为一个组件集
4. 递归收集该组件集下所有节点：
   - 遇到 INSTANCE 节点：追踪 `symbolData.symbolID`，将引用的 SYMBOL 的整个**组件集**一并收入（保留 FRAME 包装）
5. 提取组件节点引用的所有 blob 条目，本地重新从 0 编号，写入输出 hex
6. 编码（kiwi encode → zstd 压缩 → pixso-kw 文件头）→ 转 hex

**自洽性保证**：每个 hex 文件包含所需的全部节点和 blob 数据，加载时不依赖外部文件。