# Logger 模块

零依赖日志系统，支持控制台和文件双输出。

## 使用方法

### 1. 引入 logger

```javascript
const createLogger = require('../logger');
const logger = createLogger({
  name: 'lib-admin-service',    // 服务名称
  level: process.env.LOG_LEVEL || 'info',  // 日志级别
  logDir: process.env.LOG_DIR             // 日志目录（可选）
});
```

### 2. 配置环境变量

在服务 `.env` 文件中添加：

```bash
LOG_LEVEL=info        # 可选：debug, info, warn, error
LOG_DIR=~/logs/nodejs # 可选，默认 ~/logs/nodejs/{服务名}
```

### 3. 调用日志方法

```javascript
logger.info('服务启动', { port: 3103 });
logger.warn('配置缺失', { key: 'LIB_OUT_DIR' });
logger.error('请求失败', { error: err.message, stack: err.stack });
logger.debug('调试信息', { data: largeObject });
```

## 日志级别

- `debug`: 详细调试信息（包括 LLM 输入输出）
- `info`: 关键操作日志（默认）
- `warn`: 警告信息
- `error`: 错误信息

级别过滤：低于 `LOG_LEVEL` 的日志不会输出。

## 输出格式

### 控制台

```
[2026-06-11T17:45:23.123Z] INFO  [lib-admin-service] 服务启动
    port: 3103
```

### 文件（JSON）

```json
{"timestamp":"2026-06-11T17:45:23.123Z","level":"info","service":"lib-admin-service","message":"服务启动","port":3103}
```

## 日志文件路径

```
~/logs/nodejs/
├── lib-admin-service/
│   └── 2026-06-11.log
├── dsl-match-service/
│   └── 2026-06-11.log
└── dsl-to-hex/
    └── 2026-06-11.log
```

按天自动分割，无需手动管理。

## 错误堆栈记录

```javascript
try {
  // ...
} catch (err) {
  logger.error('操作失败', {
    error: err.message,
    stack: err.stack  // 记录完整堆栈
  });
}
```

## 大数据量处理

对于超长数据（如 LLM 输入输出），debug 级别会完整记录：

```javascript
logger.debug('LLM 调用', {
  input: JSON.stringify(messages),
  output: response
});
```

生产环境建议使用 info 级别，避免日志文件过大。

## 日志查看命令

```bash
# 查看实时日志
tail -f ~/logs/nodejs/lib-admin-service/2026-06-11.log

# 查看错误日志
grep '"level":"error"' ~/logs/nodejs/*/2026-06-11.log

# 查看最近 50 行
tail -50 ~/logs/nodejs/lib-admin-service/2026-06-11.log
```