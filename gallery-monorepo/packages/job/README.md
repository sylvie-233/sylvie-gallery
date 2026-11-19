# @sylvie/job

基于 [BullMQ](https://docs.bullmq.io/) 的共享任务调度层，支持**定时任务**（cron / 固定间隔）与**延时任务**。任务数据保存在 Redis，服务重启后不会丢失。包内只做队列编排，不包含业务逻辑。

## 定位

- 为 API 提供统一的「定时 / 延时任务」能力，替代进程内 `setTimeout` / `setInterval`。
- 任务名与数据类型通过泛型 `JobDataMap` 强类型约束，Worker 漏注册任务在编译期暴露。
- 不绑定日志实现，由调用方注入 `{ debug, info, warn, error }`。
- 依赖 **Redis**；未部署 Redis 时不要启动 Worker。

## 目录结构

```
packages/job/
├── src/
│   ├── index.ts   # 公共入口：导出类型与 JobQueue / createJobQueue
│   ├── queue.ts   # BullMQ 封装：入队、定时任务、Worker、健康检查、关闭
│   └── types.ts   # 公共类型：连接参数、任务映射、处理器、队列选项、定时配置
├── package.json
├── tsconfig.json
└── eslint.config.js
```

## 引入方式

在 workspace 内的应用包中添加依赖：

```json
{
  "dependencies": {
    "@sylvie/job": "workspace:*"
  }
}
```

```ts
import { createJobQueue, type JobQueue, type JobDataMap } from '@sylvie/job';
```

注意：`@sylvie/job` 使用 `"type": "module"`，仅提供 ESM 入口（`dist/index.js`），并随 `dist/index.d.ts` 提供类型。

## 快速开始

```ts
import { createJobQueue } from '@sylvie/job';

type Jobs = {
  'order.timeout': { orderNo: string };
  'report.daily': Record<string, never>;
};

const jobs = createJobQueue<Jobs>({
  name: 'my-service',
  prefix: 'sylvie:jobs',
  redis: { host: '127.0.0.1', port: 6379 },
  // 可选：覆盖默认任务选项（默认重试 3 次、指数退避）
  defaultJobOptions: { attempts: 3 },
  logger: {
    info: (message, meta) => console.info(message, meta),
    warn: (message, meta) => console.warn(message, meta),
    error: (message, error, meta) => console.error(message, error, meta),
  },
});

// 启动 Worker：handler 必须覆盖所有任务名；第二个参数为并发数
jobs.startWorker(
  {
    'order.timeout': async (job) => {
      await closeOrder(job.data.orderNo);
    },
    'report.daily': async () => {
      await buildDailyReport();
    },
  },
  2,
);

// 立即执行
await jobs.add('order.timeout', { orderNo: 'SV001' });

// 延时执行（jobId 相同视为同一任务；禁止包含冒号）
await jobs.addDelayed('order.timeout', { orderNo: 'SV001' }, 15 * 60 * 1000, 'timeout-SV001');

// 替换延时任务：先删除旧任务再按新时间入队，适合「续费后重算到期时间」
await jobs.rescheduleDelayed('order.timeout', { orderNo: 'SV001' }, 30 * 60 * 1000, 'timeout-SV001');

// 取消
await jobs.remove('timeout-SV001');

// 定时任务：cron 或固定间隔二选一，同一 schedulerId 会覆盖旧配置
await jobs.upsertRepeatable(
  'daily-report',
  { pattern: '0 3 * * *', tz: 'Asia/Shanghai' },
  'report.daily',
  {},
);
await jobs.upsertRepeatable('heartbeat', { every: 60_000 }, 'report.daily', {});

// 健康检查与关闭
const ok = await jobs.healthy();
await jobs.close();
```

## API 概览

| 成员 | 签名 | 说明 |
|---|---|---|
| `createJobQueue` | `<Map>(options: JobQueueOptions) => JobQueue<Map>` | 创建队列实例；创建时即建立 Queue 的 Redis 连接 |
| `jobs.queue` | `Queue` | 底层 BullMQ 队列，特殊场景可直接使用 |
| `jobs.add` | `<K>(name: K, data: Map[K], options?: JobsOptions) => Promise<Job>` | 添加立即执行的任务 |
| `jobs.addDelayed` | `<K>(name: K, data: Map[K], delayMs: number, jobId?: string) => Promise<Job>` | 添加延时任务；`jobId` 相同时复用同一任务 |
| `jobs.rescheduleDelayed` | `<K>(name: K, data: Map[K], delayMs: number, jobId: string) => Promise<Job>` | 移除同 ID 旧任务后重新入队 |
| `jobs.remove` | `(jobId: string) => Promise<boolean>` | 取消任务；不存在或正在执行时返回 `false` |
| `jobs.upsertRepeatable` | `<K>(schedulerId: string, schedule: RepeatSchedule, name: K, data: Map[K], options?: JobsOptions) => Promise<void>` | 创建 / 更新定时任务（Job Scheduler） |
| `jobs.removeRepeatable` | `(schedulerId: string) => Promise<boolean>` | 移除定时任务及未执行的调度 |
| `jobs.startWorker` | `(handlers: JobHandlers<Map>, concurrency?: number) => this` | 启动 Worker，默认并发 1；重复调用幂等 |
| `jobs.healthy` | `() => Promise<boolean>` | `PING` 探测 Redis，受 `operationTimeoutMs` 约束 |
| `jobs.close` | `() => Promise<void>` | 依次关闭 Worker、Queue 与连接，单步最多等待 3 秒 |

## 设计边界

- **只管调度，不管业务**：包内不读取数据库、不发通知；处理器由调用方注入。
- **单队列单 Worker**：一个 `JobQueue` 实例对应一个队列名；同队列只应启动一次 Worker。
- **定时任务用 Job Scheduler**：`upsertRepeatable` 基于 BullMQ `upsertJobScheduler`，同一 `schedulerId` 重复调用只更新配置，不会堆积重复调度。
- **延时任务以 `jobId` 去重**：同 ID 任务已存在时不会新建；需要更新触发时间用 `rescheduleDelayed`。
- **快速失败**：Queue 连接 `maxRetriesPerRequest = 1`，所有队列操作受 `operationTimeoutMs`（默认 3000ms）约束，Redis 不可用时健康检查 / 入队不会长期挂起。
- **Worker 独立连接**：Worker 使用单独 Redis 连接且不限制请求级重试，满足 BullMQ 阻塞命令的自动重连要求。
- **不实现持久化**：可靠性由 Redis 与 BullMQ 提供；Redis 数据丢失即任务丢失。

## 配置项

`JobQueueOptions`：

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `name` | `string` | 是 | — | 队列名，同一 Redis 下唯一 |
| `prefix` | `string` | 否 | BullMQ 默认 | 键前缀，多服务共用 Redis 时用于隔离 |
| `redis.url` | `string` | 否 | — | 完整连接串，优先于 host/port |
| `redis.host` | `string` | 否 | `127.0.0.1` | Redis 主机 |
| `redis.port` | `number` | 否 | `6379` | Redis 端口 |
| `redis.password` | `string` | 否 | — | Redis 密码 |
| `redis.db` | `number` | 否 | `0` | 数据库编号 |
| `defaultJobOptions` | `JobsOptions` | 否 | 重试 3 次、指数退避 2s | 在默认值上按字段覆盖 |
| `operationTimeoutMs` | `number` | 否 | `3000` | 队列操作超时，Redis 不可用时快速失败 |
| `logger` | `JobLogger` | 否 | 空实现 | 日志注入，方法均可选 |

`RepeatSchedule`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `pattern` | `string` | cron 表达式，如 `*/10 * * * *` |
| `every` | `number` | 固定间隔（毫秒），与 `pattern` 二选一 |
| `tz` | `string` | cron 时区，如 `Asia/Shanghai` |

## 与 API 集成位置

API 侧入口为 `apps/api/src/jobs/index.ts`，是唯一的 `@sylvie/job` 使用方：

- 懒加载单例：`createJobQueue<ApiJobs>({ name: 'api', prefix: `${env.CACHE_PREFIX}:jobs`, redis: ... })`。
- `JOB_ENABLED=true` 时 `startJobs()` 启动 Worker，`JOB_CONCURRENCY` 控制并发。
- 定时任务 `vip.expire-sweep`：cron 为 `JOB_VIP_SWEEP_CRON`（默认 `*/10 * * * *`），时区固定 `Asia/Shanghai`；启动时补跑一次到期降级。
- 延时任务 `vip.expire-notice`：`scheduleVipExpiryNotice(userId)` 按 `user.vip_expire_at` 计算延时，`jobId` 为 `vip-expire-${userId}`；续费时通过 `rescheduleDelayed` 覆盖旧触发点，`cancelVipExpiryNotice` 负责取消。
- `stopJobs()` 在进程退出时关闭实例；`jobsHealthy()` 供健康检查使用，未启用时视为正常。
- 定时 / 延时任务注册失败只记录日志，不阻断 API 启动；Redis 恢复后需重启以重新注册调度。

## 注意事项

- **幂等**：失败重试、重复投递都可能导致同一任务多次执行，处理器必须按业务键做幂等。
- **jobId 禁止冒号**：BullMQ 限制自定义 `jobId` 不能包含 `:`，请使用 `-` 或 `_` 分隔（如 `vip-expire-12`）；`addDelayed` / `rescheduleDelayed` 会提前校验并抛错。
- **时区**：cron 未指定 `tz` 时由 Broker 进程时区解释；跨时区部署请显式传入 `Asia/Shanghai`。
- **Redis 依赖**：任务与调度器均存储在 Redis；Redis 不可用时入队和健康检查会快速失败，Worker 自动重连。全部实例共用一个 Redis 时用 `prefix` 隔离。
- **多实例**：每个实例都可启动 Worker，BullMQ 会把同一任务只分发给一个实例；调度器按 `schedulerId` 唯一，可重复注册。
- **关闭**：进程退出前调用 `close()`；关闭后实例不可复用。
