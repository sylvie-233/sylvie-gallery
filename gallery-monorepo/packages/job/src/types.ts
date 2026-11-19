/**
 * @sylvie/job 公共类型定义。
 *
 * 包含 Redis 连接参数、任务名 / 数据映射、处理器、队列选项与定时任务配置。
 * 类型不依赖具体业务，日志接口以可选方法声明，避免包内绑定日志实现。
 */
import type { Job, JobsOptions } from 'bullmq';

/**
 * Redis 连接参数。
 *
 * 提供 `url` 时优先按连接串创建客户端，忽略 host/port/password/db。
 */
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

/**
 * 任务数据映射：任务名 → 数据类型。
 *
 * 作为 `JobQueue` 的泛型约束，使任务名与 `data` 类型在入队和消费时保持强类型。
 */
export type JobDataMap = Record<string, unknown>;

/**
 * 任务处理器。
 *
 * 收到 BullMQ `Job` 实例（含 `data`、`id`、`attemptsMade` 等）。
 * 处理器应保证幂等：失败重试或重复投递可能多次执行同一任务。
 */
export type JobHandler<Data> = (job: Job<Data>) => Promise<void>;

/**
 * 处理器映射：必须覆盖所有已声明的任务名。
 *
 * 映射类型会强制 Worker 注册全部任务，遗漏在编译期即可发现。
 */
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
  /** 默认任务选项；内置重试 3 次、指数退避、完成后保留 200 条、失败保留 1000 条。 */
  defaultJobOptions?: JobsOptions;
  /** 队列操作超时（毫秒），默认 3000。Redis 不可用时快速失败。 */
  operationTimeoutMs?: number;
  logger?: JobLogger;
}

/**
 * 定时任务配置：cron 或固定间隔二选一。
 *
 * 两者同时提供时 BullMQ 以 `pattern` 为准；都未提供会在注册时抛错。
 */
export interface RepeatSchedule {
  /** cron 表达式，如 `0 3 * * *`（每天 03:00）。 */
  pattern?: string;
  /** 固定间隔（毫秒），与 pattern 二选一。 */
  every?: number;
  /**
   * cron 时区，如 `Asia/Shanghai`。
   *
   * 不指定时由 Broker 进程所在时区解释 cron 表达式；跨时区部署时应显式传入。
   */
  tz?: string;
}
