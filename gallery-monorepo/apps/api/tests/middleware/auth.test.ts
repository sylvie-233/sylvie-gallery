/**
 * 鉴权中间件测试：Bearer 解析、账号状态回查，以及强制登录 / 可选登录 /
 * 管理员限定三种中间件的行为。数据库层用 mock 替身，不连接 MySQL。
 */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db/index.js', () => ({
  dbClient: { queryOne: vi.fn() },
}));

import type { AppEnv } from '../../src/types/context.js';
import { signToken } from '../../src/utils/jwt.js';
import { authenticate, loadUser, optionalAuth, readBearer, requireAdmin } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/error.js';

import { dbClient } from '../../src/db/index.js';

const activeAdminRow = {
  id: 1,
  email: 'admin@sylvie.cc',
  nickname: '管理员',
  role: 'admin',
  status: 1,
  isDeleted: 0,
  vipExpireAt: null,
};

/** 把 queryOne mock 成返回指定行。 */
function mockUserRow(row: unknown): void {
  vi.mocked(dbClient.queryOne).mockResolvedValue(row as never);
}

function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  return app;
}

beforeEach(() => {
  vi.mocked(dbClient.queryOne).mockReset();
});

describe('readBearer', () => {
  it('解析标准的 Bearer 头', () => {
    expect(readBearer('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('大小写不敏感并去除首尾空白', () => {
    expect(readBearer('bearer   token-value  ')).toBe('token-value');
  });

  it('缺失或格式不符时返回 null', () => {
    expect(readBearer(undefined)).toBeNull();
    expect(readBearer('')).toBeNull();
    expect(readBearer('Basic abc')).toBeNull();
    expect(readBearer('Bearer')).toBeNull();
  });
});

describe('loadUser', () => {
  it('返回精简后的登录用户', async () => {
    mockUserRow(activeAdminRow);
    await expect(loadUser(1)).resolves.toEqual({
      id: 1,
      email: 'admin@sylvie.cc',
      nickname: '管理员',
      role: 'admin',
      vipExpireAt: null,
    });
  });

  it('账号不存在、已删除或已停用时返回 null', async () => {
    mockUserRow(null);
    await expect(loadUser(1)).resolves.toBeNull();

    mockUserRow({ ...activeAdminRow, isDeleted: 1 });
    await expect(loadUser(1)).resolves.toBeNull();

    mockUserRow({ ...activeAdminRow, status: 0 });
    await expect(loadUser(1)).resolves.toBeNull();
  });
});

describe('authenticate', () => {
  it('有效令牌注入 currentUser', async () => {
    mockUserRow(activeAdminRow);
    const { token } = await signToken(1);

    const app = createApp();
    app.use('/me', authenticate);
    app.get('/me', (c) => c.json({ email: c.get('currentUser')?.email }));

    const response = await app.request('/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: 'admin@sylvie.cc' });
  });

  it('缺少令牌返回 401', async () => {
    const app = createApp();
    app.use('/me', authenticate);
    app.get('/me', (c) => c.json({}));

    const response = await app.request('/me');
    expect(response.status).toBe(401);
  });

  it('无效令牌返回 401', async () => {
    const app = createApp();
    app.use('/me', authenticate);
    app.get('/me', (c) => c.json({}));

    const response = await app.request('/me', { headers: { authorization: 'Bearer bad' } });
    expect(response.status).toBe(401);
    expect((await response.json()) as { message: string }).toMatchObject({
      message: '登录状态已失效，请重新登录',
    });
  });

  it('账号被停用后令牌立即失效', async () => {
    mockUserRow({ ...activeAdminRow, status: 0 });
    const { token } = await signToken(1);

    const app = createApp();
    app.use('/me', authenticate);
    app.get('/me', (c) => c.json({}));

    const response = await app.request('/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
  });
});

describe('optionalAuth', () => {
  it('无令牌时按游客放行', async () => {
    const app = createApp();
    app.use('/feed', optionalAuth);
    app.get('/feed', (c) => c.json({ user: c.get('currentUser')?.id ?? null }));

    const response = await app.request('/feed');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
  });

  it('有效令牌时注入用户，无效令牌仍按游客处理', async () => {
    mockUserRow(activeAdminRow);
    const { token } = await signToken(1);

    const app = createApp();
    app.use('/feed', optionalAuth);
    app.get('/feed', (c) => c.json({ user: c.get('currentUser')?.id ?? null }));

    const withToken = await app.request('/feed', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(await withToken.json()).toEqual({ user: 1 });

    vi.mocked(dbClient.queryOne).mockResolvedValue(null);
    const invalid = await app.request('/feed', { headers: { authorization: 'Bearer bad' } });
    expect(await invalid.json()).toEqual({ user: null });
  });
});

describe('requireAdmin', () => {
  it('管理员放行', async () => {
    const app = createApp();
    app.use('/admin', async (c, next) => {
      c.set('currentUser', {
        id: 1,
        email: 'admin@sylvie.cc',
        nickname: '管理员',
        role: 'admin',
        vipExpireAt: null,
      });
      await next();
    });
    app.use('/admin', requireAdmin);
    app.get('/admin', (c) => c.json({ ok: true }));

    const response = await app.request('/admin');
    expect(response.status).toBe(200);
  });

  it('非管理员返回 403', async () => {
    const app = createApp();
    app.use('/admin', async (c, next) => {
      c.set('currentUser', {
        id: 2,
        email: 'demo@sylvie.cc',
        nickname: '会员',
        role: 'member',
        vipExpireAt: null,
      });
      await next();
    });
    app.use('/admin', requireAdmin);
    app.get('/admin', (c) => c.json({ ok: true }));

    const response = await app.request('/admin');
    expect(response.status).toBe(403);
  });

  it('未登录返回 401', async () => {
    const app = createApp();
    app.use('/admin', requireAdmin);
    app.get('/admin', (c) => c.json({ ok: true }));

    const response = await app.request('/admin');
    expect(response.status).toBe(401);
  });
});
