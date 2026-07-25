# Pixso Schema Update - 2026-07-17

## 更新来源
- 二进制 schema 文件：`pixso.binary`

## 主要变更

### 新增结构体
1. `ProgressBlurStop` - 渐进式模糊停止点
2. `DynamicStrokeSettings` - 动态描边设置（frequency, wiggle, smoothen）
3. `ProdExtraCombinationChartInfo` - 组合图表额外信息
4. `ProdOneDimChart` - 一维图表组件

### 新增枚举值
- `NodeType::PROD_ONEDIMCHART = 159` - 一维图表节点类型
- `GridTrackSizingType::HUG = 3` - Grid track sizing 新类型
- `GridTrackSizingType::FILL = 4` - Grid track sizing 新类型

### PixsoNode 新增字段
- `DynamicStrokeSettings *dynamicStrokeSettings` - 动态描边设置
- `int32_t strokeSeed` - 描边种子值

### Effect 新增字段
- `kiwi::Array<ProgressBlurStop> progressiveStops` - 渐进式模糊停止点数组

### PrototypeInteraction 新增字段
- `float delayMs` - 延迟毫秒数

### ProdMode 新增字段
- `Paint *inactiveFillPaint` - 非活动状态填充
- `ProdOneDimChart *oneDimChart` - 一维图表组件

### ProdTextStyle 新增字段
- `VariableDataMap *variableConsumptionMap` - 变量消费映射

### ProdTDCElementinfo 新增字段
- `int32_t styleType` - 样式类型

### ProdTwoDimChart 新增字段
- `ProdExtraCombinationChartInfo *extraCombinationChartInfo` - 组合图表额外信息

### TextStyleData 新增字段
- `bool isOverrideOverTextStyle` - 是否覆盖文本样式

## 文件列表
- `pixso.binary` - 二进制 schema 源文件
- `pixso.h` - 生成的 C++ 头文件（30,036 行）
- `pixso.kiwi` - 文本格式 schema（2,625 行）
- `pixso.h.bak` - 旧版本备份（29,141 行）

## 兼容性
- 向后兼容：旧版 `.pix` 数据仍可正常解析
- 现有代码无需修改：新增字段均为可选字段

## 编译验证
- ✅ split_compset 编译通过
- ✅ 无编译警告或错误