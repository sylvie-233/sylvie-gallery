import type { Job, JobsOptions } from 'bullmq';

/** Redis 连接参数。 */
export interface RedisConnectionOptions {
  /** 完整连接串，优先于 host/port。 */
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}

/** 轻量日志接口，避免包内绑定具体日志实现。 */
export interface JobLogger {
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

/** 任务数据映射：任务名 → 数据类型。 */
export type JobDataMap = Record<string, unknown>;

/** 任务处理器。 */
export type JobHandler<Data> = (job: Job<Data>) => Promise<void>;

/** 处理器映射：必须覆盖所有已声明的任务名。 */
export type JobHandlers<Map extends JobDataMap> = {
  [K in keyof Map]: JobHandler<Map[K]>;
};

/** 创建任务队列的配置。 */
export interface JobQueueOptions {
  /** 队列名（同一 Redis 下唯一）。 */
  name: string;
  /** 键前缀，多服务共用 Redis 时用于隔离。 */
  prefix?: string;
  redis: RedisConnectionOptions;
  /** 默认任务选项；内置重试 3 次、指数退避、完成后保留 200 条。 */
  defaultJobOptions?: JobsOptions;
  /** 队列操作超时（毫秒），默认 3000。Redis 不可用时快速失败。 */
  operationTimeoutMs?: number;
  logger?: JobLogger;
}

/** 定时任务配置：cron 或固定间隔二选一。 */
export interface RepeatSchedule {
  /** cron 表达式，如每 10 分钟一次。 */
  pattern?: string;
  /** 固定间隔（毫秒），与 pattern 二选一。 */
  every?: number;
  /** 时区，如 `Asia/Shanghai`。 */
  tz?: string;
}
