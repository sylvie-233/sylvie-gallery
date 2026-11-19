/**
 * 会员定时 / 延时任务入口（BullMQ + Redis）。
 * 定时任务扫描并落库降级已到期的付费会员，启动时补跑一次；
 * 延时任务在到期时刻登记站内通知，续费时以同一 jobId 覆盖旧任务。
 */
import { createJobQueue, type JobQueue } from '@sylvie/job';

import { env } from '../config/env.js';
import { moduleLogger } from '../utils/logger.js';
import { expireVipMemberships, getVipExpireAt, notifyVipExpired } from './vip-expiry.js';

/** API 任务名到数据类型的映射；新增任务需同时在 startJobs 的 handlers 中注册。 */
type ApiJobs = {
  'vip.expire-sweep': Record<string, never>;
  'vip.expire-notice': { userId: number };
};

const log = moduleLogger('job');

/** 是否启用任务调度（JOB_ENABLED=true，需要 Redis）；关闭时所有调度函数静默跳过。 */
export const jobsEnabled = env.JOB_ENABLED === 'true';

let instance: JobQueue<ApiJobs> | null = null;

/** 懒加载任务队列单例：首次调用时创建 Queue 与 Redis 连接。 */
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
      // 失败重试 3 次（包内默认指数退避）；处理器必须自身幂等。
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

/**
 * 启动任务 Worker、注册会员到期扫描定时任务，并补跑一次到期降级。
 *
 * 副作用：建立 Redis 连接、启动 BullMQ Worker、按 cron（Asia/Shanghai）注册
 * 可重复调度，并立即执行一次扫描以弥补停机期间遗漏的数据。
 * 任一步失败只记录日志，不阻断 API 启动；Redis 恢复后需重启才能重新注册调度。
 */
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

/** 关闭 Worker 与队列连接；未创建过实例时直接返回（进程退出时调用）。 */
export async function stopJobs(): Promise<void> {
  if (!instance) {
    return;
  }
  await instance.close();
  instance = null;
}

/** 队列所在 Redis 是否可用；未启用任务调度时视为正常，供健康检查使用。 */
export async function jobsHealthy(): Promise<boolean> {
  return jobsEnabled ? getJobs().healthy() : true;
}

/**
 * 登记 / 刷新会员到期通知：按 `user.vip_expire_at` 计算剩余毫秒并投递 BullMQ 延时任务；
 * 续费时用同一 jobId 移除旧任务后重新入队，避免重复通知（幂等更新触发点）。
 *
 * 未启用任务、用户不存在或查询失败时静默返回；登记失败只记录告警，
 * 不影响支付履约与会员权益。
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
    // MySQL DATETIME 以北京时间字符串返回，替换空格后按进程本地时区解析；
    // 已过期（delay 为负）由下方 Math.max 归零，立即触发。
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

/** 取消会员到期通知（退款撤销权益、后台调整到期时间等场景）；取消失败只记录告警。 */
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
