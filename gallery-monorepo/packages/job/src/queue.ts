/**
 * 基于 BullMQ 的任务队列实现。
 *
 * 职责：
 * - 普通任务入队（立即执行）与延时任务入队；
 * - 定时任务（cron / 固定间隔）通过 BullMQ Job Scheduler 注册与更新；
 * - 启动 Worker 消费任务，并在关闭时统一释放 Queue、Worker 与 Redis 连接。
 *
 * 设计与限制见类注释；本文件只做队列编排，不包含任何业务逻辑。
 */
import { Queue, Worker } from 'bullmq';
import type { Job, JobsOptions } from 'bullmq';
import Redis from 'ioredis';

import type {
  JobDataMap,
  JobHandler,
  JobHandlers,
  JobQueueOptions,
  JobLogger,
  RepeatSchedule,
} from './types.js';

/**
 * 内置默认任务选项：失败重试 3 次、指数退避（起始 2 秒）；
 * 完成后保留 200 条、失败保留 1000 条供排查。调用方可通过
 * `defaultJobOptions` 按字段覆盖。
 */
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 200,
  removeOnFail: 1000,
};

/**
 * BullMQ 队列封装：
 * - 定时任务（cron / 固定间隔）通过 Job Scheduler 管理；
 * - 延时任务支持指定 `jobId`，便于续期、取消等场景覆盖旧任务；
 * - Worker 与 Queue 使用独立连接，关闭时统一释放。
 *
 * 连接策略：
 * - Queue 侧连接保持快速失败（`maxRetriesPerRequest = 1`），并给队列操作加
 *   `operationTimeoutMs` 超时，Redis 不可用时健康检查 / 入队不会长期挂起；
 * - Worker 侧使用独立连接且不限制请求级重试，满足 BullMQ 阻塞命令的自动重连要求。
 *
 * 约束：BullMQ 自定义 `jobId` 不能包含冒号，本包在入队前校验并抛出明确错误。
 */
export class JobQueue<Map extends JobDataMap = JobDataMap> {
  readonly queue: Queue;
  private readonly name: string;
  private readonly prefix: string | undefined;
  private readonly options: JobQueueOptions;
  private readonly log: JobLogger;
  private readonly connection: Redis;
  private worker?: Worker;
  private workerConnection?: Redis;

  constructor(options: JobQueueOptions) {
    this.options = options;
    this.name = options.name;
    this.prefix = options.prefix;
    this.log = options.logger ?? {};

    this.connection = this.createConnection(false);
    this.connection.on('error', (error) =>
      this.log.error?.('任务队列 Redis 连接异常', error),
    );

    this.queue = new Queue(this.name, {
      connection: this.connection,
      prefix: this.prefix,
      defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, ...options.defaultJobOptions },
    });
    this.queue.on('error', (error) => this.log.error?.('任务队列异常', error));
  }

  /**
   * 给队列操作加超时：Redis 不可用时快速失败，
   * 避免健康检查或业务请求被离线队列长期挂起。
   *
   * 超时只拒绝等待中的 Promise，不会中止 BullMQ 内部的排队操作；
   * 因此仅用于「可快速降级」的调用（入队、查询、健康探测、调度注册）。
   */
  private async withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
    const timeoutMs = this.options.operationTimeoutMs ?? 3000;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} 超时（${timeoutMs}ms）`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * 添加普通任务（立即执行）。
   *
   * 任务名受 `Map` 约束，`data` 类型由任务名推导；默认使用队列级
   * `defaultJobOptions`，可用 `options` 覆盖重试、优先级等。
   */
  async add<K extends keyof Map & string>(
    name: K,
    data: Map[K],
    options?: JobsOptions,
  ): Promise<Job<Map[K]>> {
    return this.withTimeout(
      this.queue.add(name, data, options) as Promise<Job<Map[K]>>,
      '任务入队',
    );
  }

  /**
   * 添加延时任务；`jobId` 相同时复用同一任务。
   *
   * BullMQ 以 `jobId` 去重：若同 ID 任务已存在（等待中 / 延时中），本次入队
   * 不会新建任务，适合「同一业务对象只保留一条待触发任务」的续期、取消场景。
   * 需要更新触发时间时应使用 {@link rescheduleDelayed}，先移除旧任务再重新入队。
   *
   * `delayMs` 会取整并钳制为非负数；任务完成后立即从队列移除。
   *
   * @throws `jobId` 含冒号时抛错（BullMQ 限制，请改用 `-` 或 `_` 分隔）。
   */
  async addDelayed<K extends keyof Map & string>(
    name: K,
    data: Map[K],
    delayMs: number,
    jobId?: string,
  ): Promise<Job<Map[K]>> {
    if (jobId?.includes(':')) {
      throw new Error('jobId 不能包含冒号（BullMQ 限制），请使用 - 或 _ 分隔');
    }
    return this.add(name, data, {
      delay: Math.max(0, Math.floor(delayMs)),
      jobId,
      removeOnComplete: true,
    });
  }

  /**
   * 替换延时任务：先移除同 ID 的旧任务再重新入队。
   * 适用于「续费后重新计算到期时间」这类需要更新触发点的场景。
   *
   * 注意：移除与入队不是原子操作；若旧任务正在执行，`remove` 会失败，
   * 此时仍会写入新任务，调用方应保证处理器幂等。新任务同样受
   * `jobId` 禁止冒号的约束。
   */
  async rescheduleDelayed<K extends keyof Map & string>(
    name: K,
    data: Map[K],
    delayMs: number,
    jobId: string,
  ): Promise<Job<Map[K]>> {
    await this.remove(jobId);
    return this.addDelayed(name, data, delayMs, jobId);
  }

  /**
   * 移除任务；不存在或正在执行时返回 false。
   *
   * 仅能取消尚未进入 active 状态的任务；返回 `false` 不视为异常，
   * 调用方无需区分「任务不存在」与「任务正在执行」。
   */
  async remove(jobId: string): Promise<boolean> {
    const job = await this.withTimeout(this.queue.getJob(jobId), '任务查询');
    if (!job) {
      return false;
    }
    try {
      await this.withTimeout(job.remove(), '任务移除');
      return true;
    } catch (error) {
      this.log.warn?.('任务移除失败（可能正在执行）', { jobId, error: String(error) });
      return false;
    }
  }

  /**
   * 创建或更新定时任务；相同 `schedulerId` 会覆盖旧配置。
   *
   * 使用 BullMQ `upsertJobScheduler`：定时任务由 Broker 侧调度器管理，
   * 重复调用只更新 cron / 间隔与任务数据，不会堆积重复调度。
   * `schedule` 必须提供 `pattern`（cron，建议同时指定 `tz`）或 `every`（毫秒）之一。
   *
   * 多实例部署时各实例可重复调用；调度器按 `schedulerId` 唯一。
   */
  async upsertRepeatable<K extends keyof Map & string>(
    schedulerId: string,
    schedule: RepeatSchedule,
    name: K,
    data: Map[K],
    options?: JobsOptions,
  ): Promise<void> {
    if (!schedule.pattern && !schedule.every) {
      throw new Error('定时任务必须提供 pattern 或 every');
    }
    await this.withTimeout(
      this.queue.upsertJobScheduler(
        schedulerId,
        {
          ...(schedule.pattern ? { pattern: schedule.pattern } : {}),
          ...(schedule.every ? { every: schedule.every } : {}),
          ...(schedule.tz ? { tz: schedule.tz } : {}),
        },
        { name, data, opts: options },
      ),
      '定时任务注册',
    );
  }

  /**
   * 移除定时任务及其未执行的调度。
   *
   * 已进入队列或正在执行的任务不会被回滚；返回是否实际移除了调度器。
   */
  async removeRepeatable(schedulerId: string): Promise<boolean> {
    return this.withTimeout(this.queue.removeJobScheduler(schedulerId), '定时任务移除');
  }

  /**
   * 启动 Worker；同一个队列只应启动一次。
   *
   * Worker 使用独立 Redis 连接（阻塞命令要求长重试），与 Queue 连接互不影响。
   * `handlers` 必须覆盖 `Map` 中声明的全部任务名；未知任务会被视为错误并触发
   * BullMQ 重试。`concurrency` 控制单实例并发消费数。
   *
   * 重复调用是幂等的：已启动时直接返回当前实例。
   */
  startWorker(handlers: JobHandlers<Map>, concurrency = 1): this {
    if (this.worker) {
      return this;
    }

    this.workerConnection = this.createConnection(true);
    this.workerConnection.on('error', (error) =>
      this.log.error?.('任务 Worker Redis 连接异常', error),
    );

    this.worker = new Worker(
      this.name,
      async (job) => {
        const handler = handlers[job.name as keyof Map] as JobHandler<unknown> | undefined;
        if (!handler) {
          throw new Error(`未注册任务处理器：${job.name}`);
        }
        await handler(job as Job<unknown>);
      },
      {
        connection: this.workerConnection,
        prefix: this.prefix,
        concurrency,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.log.error?.('任务执行失败', error, {
        name: job?.name,
        jobId: job?.id,
        attempts: job?.attemptsMade,
      });
    });
    this.worker.on('error', (error) => {
      this.log.error?.('任务 Worker 异常', error);
    });

    return this;
  }

  /**
   * 队列所在 Redis 是否可用。
   *
   * 通过 `PING` 探测并受 `operationTimeoutMs` 约束；任何异常均返回 false，
   * 便于健康检查在 Redis 离线时快速降级。
   */
  async healthy(): Promise<boolean> {
    try {
      return (await this.withTimeout(this.connection.ping(), 'Redis 探测')) === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * 关闭 Worker、队列与连接；Redis 不可用时最多等待 3 秒。
   *
   * 顺序：先停止 Worker 接收新任务，再关闭 Queue，最后断开连接。
   * 每一步都有 3 秒兜底超时，确保进程退出流程不会被 Redis 异常阻塞；
   * 关闭后实例不应再被复用。
   */
  async close(): Promise<void> {
    const settle = async (operation: Promise<unknown>): Promise<void> => {
      await Promise.race([
        operation,
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]).catch(() => undefined);
    };

    if (this.worker) {
      await settle(this.worker.close());
    }
    await settle(this.queue.close());
    this.workerConnection?.disconnect();
    try {
      await settle(this.connection.quit());
    } catch {
      this.connection.disconnect();
    }
  }

  /**
   * 创建 ioredis 连接。
   *
   * `url` 优先于 host/port；未提供地址时回落到本机默认 Redis。
   * `blocking` 为 true 时供 Worker 使用（不限制请求级重试），否则供 Queue 使用
   * （单次重试后失败，由 `withTimeout` 兜底快速失败）。
   */
  private createConnection(blocking: boolean): Redis {
    const redis = this.options.redis;
    const common = {
      // Worker 使用阻塞命令，BullMQ 要求不限制请求级重试；
      // 队列连接保持快速失败，避免 Redis 不可用时健康检查 / 入队长期挂起。
      maxRetriesPerRequest: blocking ? null : 1,
      enableReadyCheck: true,
    } as const;

    const client = redis.url
      ? new Redis(redis.url, common)
      : new Redis({
          host: redis.host ?? '127.0.0.1',
          port: redis.port ?? 6379,
          password: redis.password || undefined,
          db: redis.db ?? 0,
          ...common,
        });

    client.on('error', () => undefined);
    return client;
  }
}

/**
 * 创建任务队列实例。
 *
 * 泛型 `Map` 声明任务名与数据类型的映射，供 `add` / `addDelayed` /
 * `startWorker` 做编译期校验。实例创建时即建立 Queue 的 Redis 连接。
 */
export function createJobQueue<Map extends JobDataMap = JobDataMap>(
  options: JobQueueOptions,
): JobQueue<Map> {
  return new JobQueue<Map>(options);
}
