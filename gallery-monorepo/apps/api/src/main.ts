/**
 * 服务启动入口：先启动可观测性 SDK（须早于 mysql2 / http / ioredis 等模块加载，
 * 自动埋点才能生效），再确认数据库与对象存储可用，启动定时任务与消息队列，
 * 最后监听端口，并处理 SIGINT / SIGTERM 的优雅关闭。
 */
import { env } from './config/env.js';
import { startObservability, stopObservability } from './observability/index.js';
import { logger } from './utils/logger.js';

// 顶层 await 保证 SDK 先于业务模块初始化；失败时降级为无埋点运行，不阻断启动。
try {
  await startObservability();
  if (env.OBSERVABILITY_ENABLED === 'true') {
    logger.info('可观测性已启动', {
      endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || 'OpenTelemetry 默认端点',
    });
  } else {
    logger.debug('可观测性未启用（OBSERVABILITY_ENABLED=false）');
  }
} catch (error) {
  logger.error('可观测性初始化失败，已降级为无埋点运行', error);
}

/** 启动流程：依赖探测 → 启动后台组件 → 监听端口 → 注册关闭信号。 */
async function bootstrap(): Promise<void> {
  // 业务模块在遥测启动后再加载，确保自动埋点能够 patch 到 mysql2 / http / ioredis。
  const [
    { serve },
    { default: app },
    { cache },
    { dbClient },
    { startJobs, stopJobs },
    { startMq, stopMq },
    { closeNotifier },
    { ensureBucket },
  ] = await Promise.all([
    import('@hono/node-server'),
    import('./app.js'),
    import('./cache/index.js'),
    import('./db/index.js'),
    import('./jobs/index.js'),
    import('./mq/index.js'),
    import('./services/notify.service.js'),
    import('./services/storage.service.js'),
  ]);

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
      void Promise.all([
        stopMq(),
        stopJobs(),
        dbClient.close(),
        cache.close(),
        // 遥测 flush 失败不应阻断进程退出。
        stopObservability().catch((error: unknown) => {
          logger.warn('可观测性关闭失败', error);
        }),
      ])
        .then(() => logger.flush())
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          logger.error('关闭服务依赖失败', error);
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
