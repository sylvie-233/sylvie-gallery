/**
 * 服务启动入口：先确认数据库与对象存储可用，再启动定时任务与消息队列，
 * 最后监听端口，并处理 SIGINT / SIGTERM 的优雅关闭。
 */
import { serve } from '@hono/node-server';

import app from './app.js';
import { cache } from './cache/index.js';
import { env } from './config/env.js';
import { dbClient } from './db/index.js';
import { startJobs, stopJobs } from './jobs/index.js';
import { startMq, stopMq } from './mq/index.js';
import { closeNotifier } from './services/notify.service.js';
import { ensureBucket } from './services/storage.service.js';
import { logger } from './utils/logger.js';

/** 启动流程：依赖探测 → 启动后台组件 → 监听端口 → 注册关闭信号。 */
async function bootstrap(): Promise<void> {
  // 启动前确认数据库与对象存储可用，避免「服务可访问但所有接口报错」
  await dbClient.ping();
  await ensureBucket();
  await startJobs();
  await startMq();

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
      hostname: env.HOST,
    },
    (info) => {
      logger.info('服务已启动', {
        url: `http://${info.address}:${info.port}`,
        apiPrefix: '/api',
        docs: '/api/docs',
        health: '/health',
      });
    },
  );

  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) {
      return;
    }
    closing = true;
    logger.info('收到关闭信号，正在关闭服务', { signal });

    server.close(() => {
      closeNotifier();
      void Promise.all([stopMq(), stopJobs(), dbClient.close(), cache.close()])
        .then(() => logger.flush())
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          logger.error('关闭数据库连接失败', error);
          void logger.flush().finally(() => process.exit(1));
        });
    });

    // 兜底超时：连接迟迟无法释放时强制退出，避免容器 stop 卡死。
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  logger.error('服务启动失败', error);
  void logger.flush().finally(() => process.exit(1));
});
