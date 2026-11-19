# @sylvie/logger

基于 [pino](https://getpino.io/) 的共享日志层。业务代码只依赖统一的 `Logger` 接口，底层实现可整体替换；包内不依赖 Hono / MySQL 等框架，可直接复制到其它服务使用。

## 使用

```ts
import { createLogger } from '@sylvie/logger';

// 开发环境默认彩色输出，生产环境默认 JSON（由 createLogger 内部判断 NODE_ENV）
export const logger = createLogger({
  service: 'sylvie-api',
  level: 'info',
  pretty: undefined,
});

logger.info('服务已启动', { port: 3000 });
logger.error('订单创建失败', error, { orderNo });
```

### 按模块派生

```ts
const log = logger.scope('album'); // 等价于 logger.child({ module: 'album' })
log.warn('图片下载失败', error, { index: 3 });
```

### Error 与字段

`warn` / `error` / `fatal` 的第二个参数既可以是 `Error`，也可以是普通字段对象：

```ts
log.error('请求失败', new Error('boom'), { requestId });
// => { err: {...}, requestId, msg: '请求失败' }

log.error('请求失败', { requestId, status: 500 });
```

### 测试

```ts
const log = createNoopLogger();
```

## 配置

| 选项 | 说明 |
|---|---|
| `service` | 必填，写入每条日志的 `service` 字段。 |
| `level` | 最低级别，默认 `info`。 |
| `pretty` | 是否彩色输出；默认非 `production` 开启。 |
| `base` | 每条日志固定携带的字段。 |
| `redact` | 追加脱敏路径（pino redact 语法），与内置密码/令牌规则合并。 |
| `pinoOptions` | 逃生舱：覆盖 pino 原生配置。 |

内置脱敏规则覆盖 `password`、`token`、`authorization`、`cookie` 及其一级子字段，命中时输出 `[REDACTED]`。

## 对外接口

- `trace` / `debug` / `info` / `warn` / `error` / `fatal`
- `child(bindings)` / `scope(module)`：派生带上下文的子日志
- `isLevelEnabled(level)`
- `flush()`：等待异步 transport 落盘
- `raw`：底层 pino 实例（特殊场景）
