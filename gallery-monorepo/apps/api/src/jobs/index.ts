import { createJobQueue, type JobQueue } from '@sylvie/job';

import { env } from '../config/env.js';
import { moduleLogger } from '../utils/logger.js';
import { expireVipMemberships, getVipExpireAt, notifyVipExpired } from './vip-expiry.js';

type ApiJobs = {
  'vip.expire-sweep': Record<string, never>;
  'vip.expire-notice': { userId: number };
};

const log = moduleLogger('job');

/** 是否启用任务调度（需要 Redis）。 */
export const jobsEnabled = env.JOB_ENABLED === 'true';

let instance: JobQueue<ApiJobs> | null = null;

function getJobs(): JobQueue<ApiJobs> {
  if (!instance) {
    instance = createJobQueue<ApiJobs>({
      name: 'api',
      prefix: `${env.CACHE_PREFIX}:jobs`,
      redis: {
        url: env.REDIS_URL || undefined,
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD || undefined,
        db: env.REDIS_DB,
      },
      defaultJobOptions: { attempts: 3 },
      logger: {
        debug: (message, meta) => log.debug(message, meta),
        info: (message, meta) => log.info(message, meta),
        warn: (message, meta) => log.warn(message, meta),
        error: (message, error, meta) => log.error(message, error, meta),
      },
    });
  }
  return instance;
}

/** 会员到期延时通知的任务 ID：同一用户只保留一条（BullMQ 不允许 ID 含冒号）。 */
function vipExpiryJobId(userId: number): string {
  return `vip-expire-${userId}`;
}

/** 启动 Worker、注册定时任务，并补跑一次到期降级。 */
export async function startJobs(): Promise<void> {
  if (!jobsEnabled) {
    log.info('任务调度未启用（JOB_ENABLED=false）');
    return;
  }

  const jobs = getJobs();
  jobs.startWorker(
    {
      'vip.expire-sweep': async () => {
        const count = await expireVipMemberships();
        if (count > 0) {
          log.info('付费会员到期降级完成', { count });
        }
      },
      'vip.expire-notice': async (job) => {
        const sent = await notifyVipExpired(job.data.userId);
        if (sent) {
          log.info('已发送会员到期通知', { userId: job.data.userId });
        }
      },
    },
    env.JOB_CONCURRENCY,
  );

  try {
    await jobs.upsertRepeatable(
      'vip-expire-sweep',
      { pattern: env.JOB_VIP_SWEEP_CRON, tz: 'Asia/Shanghai' },
      'vip.expire-sweep',
      {},
    );
    // 启动时补跑一次，减少停机期间未处理的数据。
    const count = await expireVipMemberships();
    log.info('任务调度已启动', {
      sweepCron: env.JOB_VIP_SWEEP_CRON,
      concurrency: env.JOB_CONCURRENCY,
      expiredOnBoot: count,
    });
  } catch (error) {
    // Redis 不可用不应阻断 API 启动；恢复后需重启以重新注册定时任务。
    log.error('任务调度启动失败（Redis 可能不可用）', error);
  }
}

/** 关闭 Worker 与队列连接。 */
export async function stopJobs(): Promise<void> {
  if (!instance) {
    return;
  }
  await instance.close();
  instance = null;
}

/** 队列所在 Redis 是否可用；未启用时视为正常。 */
export async function jobsHealthy(): Promise<boolean> {
  return jobsEnabled ? getJobs().healthy() : true;
}

/**
 * 登记 / 刷新会员到期通知：
 * 按到期时间设置延时任务，续费时用同一 jobId 覆盖旧任务。
 */
export async function scheduleVipExpiryNotice(userId: number): Promise<void> {
  if (!jobsEnabled) {
    return;
  }
  try {
    const expireAt = await getVipExpireAt(userId);
    if (!expireAt) {
      return;
    }
    const delay = new Date(expireAt.replace(' ', 'T')).getTime() - Date.now();
    await getJobs().rescheduleDelayed(
      'vip.expire-notice',
      { userId },
      Math.max(0, delay),
      vipExpiryJobId(userId),
    );
  } catch (error) {
    log.warn('会员到期通知任务登记失败', error, { userId });
  }
}

/** 取消会员到期通知（退款等场景）。 */
export async function cancelVipExpiryNotice(userId: number): Promise<void> {
  if (!jobsEnabled) {
    return;
  }
  try {
    await getJobs().remove(vipExpiryJobId(userId));
  } catch (error) {
    log.warn('会员到期通知任务取消失败', error, { userId });
  }
}
