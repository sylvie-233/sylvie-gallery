/**
 * 请求日志中间件测试：requestId 生成 / 透传、请求级子日志注入，
 * 以及异常路径不影响统一错误响应。
 */
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import type { AppEnv } from '../../src/types/context.js';
import { HttpError } from '../../src/utils/http.js';
import { errorHandler } from '../../src/middleware/error.js';
import { requestLogger } from '../../src/middleware/request-logger.js';

function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requestLogger);
  app.get('/ok', (c) => c.json({ hasLogger: Boolean(c.get('logger')) }));
  app.get('/bad', () => {
    throw new HttpError(400, '参数不合法');
  });
  app.get('/boom', () => {
    throw new Error('unexpected');
  });
  app.onError(errorHandler);
  return app;
}

describe('requestLogger', () => {
  it('自动生成 requestId 并写入响应头', async () => {
    const response = await createApp().request('/ok');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('透传上游传入的 requestId', async () => {
    const response = await createApp().request('/ok', {
      headers: { 'x-request-id': 'upstream-request-id' },
    });
    expect(response.headers.get('x-request-id')).toBe('upstream-request-id');
  });

  it('为请求注入子日志', async () => {
    const response = await createApp().request('/ok');
    expect(await response.json()).toEqual({ hasLogger: true });
  });

  it('4xx 与 5xx 异常仍返回统一错误响应', async () => {
    const app = createApp();

    const bad = await app.request('/bad');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: 400, message: '参数不合法' });

    const boom = await app.request('/boom');
    expect(boom.status).toBe(500);
    expect(await boom.json()).toMatchObject({ code: 500, message: '服务器内部错误' });
  });
});
