# @sylvie/job

基于 [BullMQ](https://docs.bullmq.io/) 的共享任务调度层，支持**定时任务**（cron / 固定间隔）与**延时任务**。任务数据保存在 Redis，服务重启后不会丢失。

## 使用

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
  concurrency: 2,
  logger: console, // 可选，结构为 { info, warn, error }
});

// 启动 Worker：handler 必须覆盖所有任务名
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

// 延时执行（jobId 相同视为同一任务）
await jobs.addDelayed('order.timeout', { orderNo: 'SV001' }, 15 * 60 * 1000, 'timeout-SV001');

// 替换延时任务：先删除旧任务再按新时间入队，适合「续费后重算到期时间」
await jobs.rescheduleDelayed('order.timeout', { orderNo: 'SV001' }, 30 * 60 * 1000, 'timeout-SV001');

// 取消
await jobs.remove('timeout-SV001');

// 定时任务：cron 或固定间隔二选一，同一 schedulerId 会覆盖旧配置
await jobs.upsertRepeatable('daily-report', { pattern: '0 3 * * *', tz: 'Asia/Shanghai' }, 'report.daily', {});
await jobs.upsertRepeatable('heartbeat', { every: 60_000 }, 'report.daily', {});

await jobs.healthy();
await jobs.close();
```

## 设计要点

- **任务名强类型**：通过 `JobDataMap` 泛型约束任务名与数据类型，worker 漏注册任务会在类型层面暴露。
- **定时任务可覆盖**：`upsertRepeatable` 使用 BullMQ Job Scheduler，同一 `schedulerId` 重复调用只更新配置，不会重复堆积。
- **延时任务可替换**：`rescheduleDelayed` 先移除同 `jobId` 的旧任务再入队；续费 / 改期场景直接调用即可。
- **jobId 限制**：BullMQ 不允许自定义 ID 包含冒号，包内会提前校验并给出明确错误。
- **快速失败**：Redis 不可用时队列操作在 `operationTimeoutMs`（默认 3 秒）内失败，避免健康检查或业务请求被离线队列挂起；Worker 连接仍按 BullMQ 要求保持长重试并自动重连。
- **优雅关闭**：`close` 会关闭 Worker、Queue 与连接，Redis 异常时最多等待 3 秒。
- **默认重试**：3 次指数退避；完成保留 200 条、失败保留 1000 条，可通过 `defaultJobOptions` 覆盖。

## 注意

- 定时任务需要 Redis；未部署 Redis 时不要启动 Worker。
- 多实例部署时每个实例都可启动 Worker，BullMQ 会分发任务，同一个任务只会被一个实例执行。
- 任务处理器应尽量幂等：BullMQ 在失败后会重试，重复执行不应产生副作用。
