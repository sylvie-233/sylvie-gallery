/**
 * MCP 鉴权测试：Agent 令牌优先（X-API-Key / Bearer），管理员 JWT 兼容，
 * 以及令牌无效、缺失、账号停用等拒绝路径。数据库与令牌服务均用 mock。
 */
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db/index.js', () => ({
  dbClient: { queryOne: vi.fn() },
}));

vi.mock('../../src/services/admin/agent-token-admin.service.js', () => ({
  authenticateAgentToken: vi.fn(),
  touchAgentToken: vi.fn(),
}));

import type { AppEnv } from '../../src/types/context.js';
import { signToken } from '../../src/utils/jwt.js';
import { dbClient } from '../../src/db/index.js';
import {
  authenticateAgentToken,
  touchAgentToken,
} from '../../src/services/admin/agent-token-admin.service.js';
import { errorHandler } from '../../src/middleware/error.js';
import { authenticateMcp } from '../../src/middleware/mcp-auth.js';

const adminUser = {
  id: 1,
  email: 'admin@sylvie.cc',
  nickname: '管理员',
  role: 'admin' as const,
  vipExpireAt: null,
};

const adminRow = { ...adminUser, status: 1, isDeleted: 0 };

function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use('/mcp', authenticateMcp);
  app.get('/mcp', (c) =>
    c.json({
      user: c.get('currentUser')?.id ?? null,
      token: c.get('agentToken') ?? null,
    }),
  );
  return app;
}

beforeEach(() => {
  vi.mocked(dbClient.queryOne).mockReset();
  vi.mocked(authenticateAgentToken).mockReset();
  vi.mocked(touchAgentToken).mockReset();
});

describe('authenticateMcp', () => {
  it('优先使用 X-API-Key 中的 Agent 令牌', async () => {
    vi.mocked(authenticateAgentToken).mockResolvedValue({
      admin: adminUser,
      tokenId: 9,
      scope: 'read',
    });

    const response = await createApp().request('/mcp', {
      headers: { 'x-api-key': 'svt_demo_token' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: 1,
      token: { id: 9, scope: 'read' },
    });
    expect(authenticateAgentToken).toHaveBeenCalledWith('svt_demo_token');
    expect(touchAgentToken).toHaveBeenCalledWith(9);
  });

  it('也支持把 Agent 令牌放在 Authorization Bearer 中', async () => {
    vi.mocked(authenticateAgentToken).mockResolvedValue({
      admin: adminUser,
      tokenId: 3,
      scope: 'write',
    });

    const response = await createApp().request('/mcp', {
      headers: { authorization: 'Bearer svt_bearer_token' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: 1,
      token: { id: 3, scope: 'write' },
    });
  });

  it('Agent 令牌无效时返回 401', async () => {
    vi.mocked(authenticateAgentToken).mockResolvedValue(null);

    const response = await createApp().request('/mcp', {
      headers: { 'x-api-key': 'svt_revoked' },
    });
    expect(response.status).toBe(401);
    expect((await response.json()) as { message: string }).toMatchObject({
      message: 'Agent 令牌无效、已吊销或已过期',
    });
    expect(touchAgentToken).not.toHaveBeenCalled();
  });

  it('既没有 Agent 令牌也没有 JWT 时返回 401', async () => {
    const response = await createApp().request('/mcp');
    expect(response.status).toBe(401);
    expect((await response.json()) as { message: string }).toMatchObject({
      message: '请提供 Agent 令牌（X-API-Key）或管理员 JWT',
    });
  });

  it('兼容管理员 JWT，但不写入 agentToken', async () => {
    vi.mocked(dbClient.queryOne).mockResolvedValue(adminRow as never);
    const { token } = await signToken(1);

    const response = await createApp().request('/mcp', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: 1, token: null });
  });

  it('JWT 无效或账号停用时返回 401', async () => {
    const app = createApp();

    const invalid = await app.request('/mcp', { headers: { authorization: 'Bearer bad' } });
    expect(invalid.status).toBe(401);

    vi.mocked(dbClient.queryOne).mockResolvedValue(null);
    const { token } = await signToken(1);
    const gone = await app.request('/mcp', { headers: { authorization: `Bearer ${token}` } });
    expect(gone.status).toBe(401);
  });
});
