import { serve } from '@hono/node-server';

import app from './app.js';
import { cache } from './cache/index.js';
import { env } from './config/env.js';
import { dbClient } from './db/index.js';
import { startJobs, stopJobs } from './jobs/index.js';
import { ensureBucket } from './services/storage.service.js';
import { logger } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  // 启动前确认数据库与对象存储可用，避免「服务可访问但所有接口报错」
  await dbClient.ping();
  await ensureBucket();
  await startJobs();

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
      void Promise.all([stopJobs(), dbClient.close(), cache.close()])
        .then(() => logger.flush())
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          logger.error('关闭数据库连接失败', error);
          void logger.flush().finally(() => process.exit(1));
        });
    });

    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  logger.error('服务启动失败', error);
  void logger.flush().finally(() => process.exit(1));
});
