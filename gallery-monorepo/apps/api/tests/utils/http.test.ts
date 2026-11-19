/**
 * HTTP 辅助测试：统一响应结构、业务异常，以及 Zod 错误格式化、
 * 来源 IP 提取与当前管理员 ID 读取。
 */
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { AuthUser } from '../../src/types/context.js';
import { HttpError, failure, success } from '../../src/utils/http.js';
import { currentAdminId, getRequestIp } from '../../src/utils/request.js';
import { formatZodError } from '../../src/utils/validate.js';

const adminUser: AuthUser = {
  id: 7,
  email: 'admin@sylvie.cc',
  nickname: '管理员',
  role: 'admin',
  vipExpireAt: null,
};

describe('HttpError', () => {
  it('携带状态码与消息', () => {
    const error = new HttpError(403, '仅管理员可执行此操作');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('HttpError');
    expect(error.status).toBe(403);
    expect(error.message).toBe('仅管理员可执行此操作');
  });
});

describe('success / failure', () => {
  const app = new Hono();
  app.get('/ok', (c) => success(c, { id: 1 }));
  app.get('/ok-custom', (c) => success(c, null, '已创建', 201));
  app.get('/fail', (c) => failure(c, 404, '接口不存在'));

  it('成功响应为 { code: 200, message, data }', async () => {
    const response = await app.request('/ok');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ code: 200, message: '操作成功', data: { id: 1 } });
  });

  it('允许自定义消息与状态码', async () => {
    const response = await app.request('/ok-custom');
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ code: 200, message: '已创建', data: null });
  });

  it('失败响应的 code 与 HTTP 状态一致，data 为 null', async () => {
    const response = await app.request('/fail');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: 404, message: '接口不存在', data: null });
  });
});

describe('formatZodError', () => {
  it('拼接字段路径与首条错误消息', () => {
    const result = z.object({ page: z.number().int() }).safeParse({ page: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).toMatch(/^page: /);
    }
  });

  it('无路径时直接返回消息', () => {
    const result = z.string().min(3).safeParse('a');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).not.toMatch(/^:/);
      expect(formatZodError(result.error).length).toBeGreaterThan(0);
    }
  });

  it('issues 为空时返回兜底提示', () => {
    expect(formatZodError(new z.ZodError([]))).toBe('请求参数不合法');
  });
});

describe('getRequestIp', () => {
  const app = new Hono();
  app.get('/ip', (c) => c.json({ ip: getRequestIp(c) ?? null }));

  it('优先取 x-forwarded-for 的第一个地址', async () => {
    const response = await app.request('/ip', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(await response.json()).toEqual({ ip: '1.2.3.4' });
  });

  it('没有代理头时使用 x-real-ip', async () => {
    const response = await app.request('/ip', { headers: { 'x-real-ip': '9.9.9.9' } });
    expect(await response.json()).toEqual({ ip: '9.9.9.9' });
  });

  it('都没有时返回 undefined', async () => {
    const response = await app.request('/ip');
    expect(await response.json()).toEqual({ ip: null });
  });
});

describe('currentAdminId', () => {
  /** 最小上下文：只实现 currentAdminId 依赖的 `get`。 */
  function fakeContext(user?: AuthUser): Parameters<typeof currentAdminId>[0] {
    return { get: () => user } as unknown as Parameters<typeof currentAdminId>[0];
  }

  it('已登录时返回用户 ID', () => {
    expect(currentAdminId(fakeContext(adminUser))).toBe(7);
  });

  it('未登录时抛出 401', () => {
    expect(() => currentAdminId(fakeContext())).toThrow(HttpError);
    try {
      currentAdminId(fakeContext());
    } catch (error) {
      expect(error).toMatchObject({ status: 401 });
    }
  });
});
