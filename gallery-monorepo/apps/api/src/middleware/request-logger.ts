import { randomUUID } from 'node:crypto';

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

import type { AppEnv } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { getRequestIp } from '../utils/request.js';

/** 与全局错误处理保持一致的状态码推断。 */
function inferStatus(error: unknown): number {
  if (error instanceof HttpError) {
    return error.status;
  }
  if (error instanceof HTTPException) {
    return error.status;
  }
  if (error instanceof ZodError) {
    return 400;
  }
  return 500;
}

/** 请求日志：注入 requestId 子日志，记录耗时、状态与来源 IP。 */
export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header('x-request-id')?.trim() || randomUUID();
  const startedAt = performance.now();
  const reqLogger = logger.child({
    requestId,
    method: c.req.method,
    path: c.req.path,
  });

  c.set('logger', reqLogger);
  c.header('x-request-id', requestId);

  try {
    await next();

    const durationMs = Math.round(performance.now() - startedAt);
    const status = c.res.status;
    const fields = { status, durationMs, ip: getRequestIp(c) };

    if (status >= 500) {
      reqLogger.error('请求完成（服务端错误）', fields);
    } else if (status >= 400) {
      reqLogger.warn('请求完成（客户端错误）', fields);
    } else if (c.req.path === '/health') {
      reqLogger.debug('请求完成', fields);
    } else {
      reqLogger.info('请求完成', fields);
    }
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    const status = inferStatus(error);
    const fields = { status, durationMs, ip: getRequestIp(c) };

    // 5xx 的堆栈由全局错误处理输出，这里只记录请求级摘要，避免重复。
    if (status >= 500) {
      reqLogger.error('请求处理失败', fields);
    } else {
      reqLogger.warn('请求被拒绝', fields);
    }

    throw error;
  }
});
