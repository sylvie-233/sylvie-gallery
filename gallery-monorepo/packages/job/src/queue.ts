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

  /** 添加普通任务（立即执行）。 */
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

  /** 添加延时任务；`jobId` 相同时复用同一任务。 */
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

  /** 移除任务；不存在或正在执行时返回 false。 */
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

  /** 创建或更新定时任务；相同 `schedulerId` 会覆盖旧配置。 */
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

  /** 移除定时任务及其未执行的调度。 */
  async removeRepeatable(schedulerId: string): Promise<boolean> {
    return this.withTimeout(this.queue.removeJobScheduler(schedulerId), '定时任务移除');
  }

  /** 启动 Worker；同一个队列只应启动一次。 */
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

  /** 队列所在 Redis 是否可用。 */
  async healthy(): Promise<boolean> {
    try {
      return (await this.withTimeout(this.connection.ping(), 'Redis 探测')) === 'PONG';
    } catch {
      return false;
    }
  }

  /** 关闭 Worker、队列与连接；Redis 不可用时最多等待 3 秒。 */
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

/** 创建任务队列实例。 */
export function createJobQueue<Map extends JobDataMap = JobDataMap>(
  options: JobQueueOptions,
): JobQueue<Map> {
  return new JobQueue<Map>(options);
}
