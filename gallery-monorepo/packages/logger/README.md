# @sylvie/logger

基于 [pino](https://getpino.io/) 的共享日志层。业务代码只依赖统一的 `Logger` 接口，底层实现可整体替换；包内不依赖 Hono / MySQL 等框架，可直接复制到其它服务使用。

## 定位

- 为 API 及其它 Node.js 服务提供**统一的结构化日志接口**，避免各模块各自 `console.*`。
- 内置**敏感字段脱敏**、开发环境彩色输出、生产环境 JSON 输出。
- 通过 `child` / `scope` 派生带上下文的子日志，便于按模块、请求检索。
- 只做日志封装，不包含业务逻辑，也不依赖具体 Web 框架。

## 安装

包位于 pnpm 工作区内，在消费方 `package.json` 中声明即可：

```json
{
  "dependencies": {
    "@sylvie/logger": "workspace:*"
  }
}
```

或在仓库根执行：

```bash
pnpm --filter @sylvie/api add @sylvie/logger --workspace
```

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

`child` 接受任意固定字段，`scope` 是 `child({ module })` 的语法糖：

```ts
const requestLog = logger.child({ requestId, userId });
requestLog.info('请求开始', { path: '/api/albums' });

const albumLog = logger.scope('album', { albumId }); // { module: 'album', albumId }
```

### Error 与字段

`warn` / `error` / `fatal` 的第二个参数既可以是 `Error`，也可以是普通字段对象：

```ts
log.error('请求失败', new Error('boom'), { requestId });
// => { err: {...}, requestId, msg: '请求失败' }

log.error('请求失败', { requestId, status: 500 });
```

`trace` / `debug` / `info` 只接受字段对象；需要记录错误时使用 `warn` 及以上级别。

### 刷新日志

使用异步 transport（如 pino-pretty）时，进程退出前可等待日志落盘：

```ts
await logger.flush();
```

### 测试

测试中可用空实现，避免真实输出：

```ts
import { createNoopLogger } from '@sylvie/logger';

const log = createNoopLogger();
```

`createNoopLogger` 的所有级别均为 no-op，派生的 `child` / `scope` 同样是空实现，`isLevelEnabled` 恒为 `false`。

## 配置

| 选项 | 说明 |
|---|---|
| `service` | 必填，写入每条日志的 `service` 字段；空白字符串会直接抛错。 |
| `level` | 最低级别，默认 `info`。 |
| `pretty` | 是否彩色输出；默认非 `production` 开启。 |
| `base` | 每条日志固定携带的字段。 |
| `redact` | 追加脱敏路径（pino redact 语法），与内置密码/令牌规则合并。 |
| `pinoOptions` | 逃生舱：覆盖 pino 原生配置。 |

`LoggerOptions` 的完整类型定义见 `src/types.ts`。`level` 可选值为 `trace` / `debug` / `info` / `warn` / `error` / `fatal` / `silent`。

## 输出格式

- **开发环境**（`pretty` 默认开启）：通过 `pino-pretty` 输出彩色日志，时间格式为 `yyyy-mm-dd HH:MM:ss.l`，并隐藏 `pid`、`hostname`、`service` 字段。
- **生产环境**（`pretty` 默认关闭）：向 stdout 输出单行 JSON，便于日志采集与聚合检索。每条日志包含 `service`、`base` 中的固定字段、ISO 时间戳与 `msg`。
- **错误序列化**：`err` / `error` 字段使用 pino 标准序列化器，展开为 `type`、`message`、`stack` 等可读信息。

可用 `pretty: true` / `pretty: false` 显式覆盖环境默认值（API 通过 `LOG_PRETTY` 环境变量控制）。

## 脱敏规则

内置规则命中后，值统一替换为 `[REDACTED]`，覆盖以下路径：

- `password`、`*.password`
- `token`、`*.token`
- `authorization`、`*.authorization`
- `cookie`、`*.cookie`
- `req.headers.authorization`
- `headers.authorization`
- `res.headers.set-cookie`

调用方可通过 `redact` 追加路径，例如：

```ts
createLogger({
  service: 'sylvie-api',
  redact: ['req.headers["x-api-key"]', 'body.idCard'],
});
```

追加规则会与内置规则合并，不会覆盖内置规则。

## 对外接口

- `trace` / `debug` / `info` / `warn` / `error` / `fatal`
- `child(bindings)` / `scope(module)`：派生带上下文的子日志
- `isLevelEnabled(level)`
- `flush()`：等待异步 transport 落盘
- `raw`：底层 pino 实例（特殊场景）

## 设计边界

- 业务层只依赖 `Logger` 接口，不直接依赖 pino；替换底层实现时业务代码无需改动。
- 只负责“写日志”，不做日志采集、轮转、落库；这些由部署侧的 stdout 采集与日志平台负责。
- 不在包内读取业务环境变量（`NODE_ENV` 仅用于判断默认输出格式），配置由调用方显式传入。
- `pinoOptions` 是逃生舱，正常业务不应依赖；传入的配置会覆盖包内默认值，使用时需自行保证脱敏规则仍然生效。
- 不吞掉错误：日志封装本身不应改变业务流程；捕获异常后的降级策略由调用方决定。

## 与 API 的集成位置

API 侧的日志实例统一在 `apps/api/src/utils/logger.ts` 装配：

```ts
import { createLogger, type Logger } from '@sylvie/logger';

export const logger = createLogger({
  service: 'sylvie-api',
  level: env.LOG_LEVEL,
  pretty,
});

/** 获取带模块标记的子日志。 */
export function moduleLogger(module: string): Logger {
  return logger.scope(module);
}
```

约定：

- 业务代码从 `apps/api/src/utils/logger.ts` 取实例，并使用 `moduleLogger('模块名')` 派生子日志。
- 不要直接使用 `console.*`；唯一例外是 `config/env.ts` 在日志初始化前的配置校验失败。
- 请求级上下文（如 `requestId`）可通过 `child` 挂载，避免每条日志重复传参。
