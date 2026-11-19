/**
 * 限流中间件测试：允许 / 拒绝 / 跳过 / 缓存故障降级，以及标识提取与
 * 请求体读取等辅助函数。缓存层用 mock 替身，不连接 Redis。
 */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/cache/index.js', () => ({
  cache: { rateLimit: vi.fn() },
}));

import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from '../../src/types/context.js';
import { cache } from '../../src/cache/index.js';
import { hashIdentifier, rateLimit, readJsonField, requestIp } from '../../src/middleware/rate-limit.js';

const allowedResult = { allowed: true, limit: 10, remaining: 9, resetSeconds: 300 };
const deniedResult = { allowed: false, limit: 10, remaining: 0, resetSeconds: 120 };

/** 用给定中间件包一层最小的读接口。 */
function createApp(middleware: MiddlewareHandler<AppEnv>): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('/x', middleware);
  app.get('/x', (c) => c.json({ ok: true }));
  app.post('/x', (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => {
  vi.mocked(cache.rateLimit).mockReset();
});

describe('rateLimit', () => {
  it('未超限时放行并写入限流响应头', async () => {
    vi.mocked(cache.rateLimit).mockResolvedValue(allowedResult);
    const app = createApp(
      rateLimit({ name: 'demo', limit: 10, windowSeconds: 300, key: () => 'k' }),
    );

    const response = await app.request('/x');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-ratelimit-limit')).toBe('10');
    expect(response.headers.get('x-ratelimit-remaining')).toBe('9');
    expect(response.headers.get('x-ratelimit-reset')).toMatch(/^\d+$/);
    expect(cache.rateLimit).toHaveBeenCalledWith('demo:k', 10, 300);
  });

  it('超限时返回 429 与 Retry-After', async () => {
    vi.mocked(cache.rateLimit).mockResolvedValue(deniedResult);
    const app = createApp(
      rateLimit({
        name: 'demo',
        limit: 10,
        windowSeconds: 300,
        key: () => 'k',
        message: '评论过于频繁，请稍后再试',
      }),
    );

    const response = await app.request('/x');
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('120');
    expect(await response.json()).toMatchObject({
      code: 429,
      message: '评论过于频繁，请稍后再试',
    });
  });

  it('标识为空时跳过限流', async () => {
    const app = createApp(
      rateLimit({ name: 'demo', limit: 1, windowSeconds: 60, key: () => null }),
    );

    const response = await app.request('/x');
    expect(response.status).toBe(200);
    expect(cache.rateLimit).not.toHaveBeenCalled();
  });

  it('命中 skip 条件时不计数', async () => {
    const app = createApp(
      rateLimit({
        name: 'demo',
        limit: 1,
        windowSeconds: 60,
        key: () => 'k',
        skip: () => true,
      }),
    );

    const response = await app.request('/x');
    expect(response.status).toBe(200);
    expect(cache.rateLimit).not.toHaveBeenCalled();
  });

  it('缓存故障时放行请求', async () => {
    vi.mocked(cache.rateLimit).mockRejectedValue(new Error('redis down'));
    const app = createApp(
      rateLimit({ name: 'demo', limit: 1, windowSeconds: 60, key: () => 'k' }),
    );

    const response = await app.request('/x');
    expect(response.status).toBe(200);
  });
});

describe('requestIp', () => {
  const app = new Hono<AppEnv>();
  app.get('/ip', (c) => c.json({ ip: requestIp(c) }));

  it('优先使用反代头', async () => {
    const response = await app.request('/ip', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
    });
    expect(await response.json()).toEqual({ ip: '10.0.0.1' });
  });

  it('无法识别时归为 unknown', async () => {
    const response = await app.request('/ip');
    expect(await response.json()).toEqual({ ip: 'unknown' });
  });
});

describe('hashIdentifier', () => {
  it('输出固定长度的稳定哈希，且不含原文', () => {
    const hashed = hashIdentifier('demo@sylvie.cc');
    expect(hashed).toMatch(/^[0-9a-f]{24}$/);
    expect(hashed).toBe(hashIdentifier('demo@sylvie.cc'));
    expect(hashed).not.toContain('demo');
    expect(hashed).not.toBe(hashIdentifier('vip@sylvie.cc'));
  });
});

describe('readJsonField', () => {
  const app = new Hono<AppEnv>();
  app.post('/field', async (c) =>
    c.json({ email: await readJsonField(c, 'email') }),
  );
  app.post('/field-and-body', async (c) => {
    const email = await readJsonField(c, 'email');
    // 读取后原始请求体仍可被业务逻辑消费。
    const body = (await c.req.json()) as Record<string, unknown>;
    return c.json({ email, raw: body['email'] ?? null });
  });

  it('读取字符串字段并去空格、转小写，且不消费请求体', async () => {
    const response = await app.request('/field-and-body', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: '  DEMO@Sylvie.CC ' }),
    });
    expect(await response.json()).toEqual({
      email: 'demo@sylvie.cc',
      raw: '  DEMO@Sylvie.CC ',
    });
  });

  it('字段缺失或非字符串时返回空字符串', async () => {
    for (const body of [{}, { email: 123 }, { email: null }]) {
      const response = await app.request('/field', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect((await response.json()) as { email: string }).toMatchObject({ email: '' });
    }
  });

  it('请求体不是合法 JSON 时返回空字符串', async () => {
    const response = await app.request('/field', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    expect(response.status).toBe(200);
    expect((await response.json()) as { email: string }).toMatchObject({ email: '' });
  });
});
