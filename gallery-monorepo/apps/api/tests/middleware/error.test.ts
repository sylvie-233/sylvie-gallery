/**
 * 全局错误处理测试：业务异常、校验异常、HTTP 异常与常见数据库错误的
 * 状态码映射，确保始终返回统一结构且不泄露堆栈。
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { AppEnv } from '../../src/types/context.js';
import { HttpError } from '../../src/utils/http.js';
import { errorHandler } from '../../src/middleware/error.js';

/** 构造一个把指定异常抛出的应用，并挂载全局错误处理。 */
function appThrowing(error: unknown): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get('/boom', () => {
    throw error;
  });
  app.onError(errorHandler);
  return app;
}

async function requestError(error: unknown): Promise<{ status: number; body: unknown }> {
  const response = await appThrowing(error).request('/boom');
  return { status: response.status, body: await response.json() };
}

describe('errorHandler', () => {
  it('业务异常保留原状态码与消息', async () => {
    const result = await requestError(new HttpError(403, '仅管理员可执行此操作'));
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ code: 403, message: '仅管理员可执行此操作', data: null });
  });

  it('Zod 校验错误映射为 400 并输出首条提示', async () => {
    const parsed = z.object({ page: z.number() }).safeParse({ page: 'x' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const result = await requestError(parsed.error);
      expect(result.status).toBe(400);
      expect((result.body as { message: string }).message).toMatch(/^page: /);
    }
  });

  it('HTTPException 使用自带状态码', async () => {
    const result = await requestError(new HTTPException(401, { message: '需要登录' }));
    expect(result.status).toBe(401);
    expect((result.body as { message: string }).message).toBe('需要登录');
  });

  it('重复键冲突映射为 409', async () => {
    const error = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
    const result = await requestError(error);
    expect(result.status).toBe(409);
    expect((result.body as { message: string }).message).toBe(
      '数据已存在，请检查邮箱或重复操作',
    );
  });

  it('数据库连接失败映射为 503', async () => {
    for (const code of ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST']) {
      const error = Object.assign(new Error('connect failed'), { code });
      const result = await requestError(error);
      expect(result.status).toBe(503);
    }
  });

  it('表不存在时提示初始化脚本', async () => {
    const error = Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
    const result = await requestError(error);
    expect(result.status).toBe(500);
    expect((result.body as { message: string }).message).toContain('数据库表不存在');
  });

  it('未知异常返回 500 且不泄露原始信息', async () => {
    const result = await requestError(new Error('SELECT * FROM secret_table'));
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ code: 500, message: '服务器内部错误', data: null });
  });
});
