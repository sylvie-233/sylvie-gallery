/**
 * MCP 鉴权中间件：Agent 令牌优先、管理员 JWT 兼容；
 * Agent 令牌以创建者身份执行，并刷新最近使用时间。
 */
import { createMiddleware } from 'hono/factory';

import {
  authenticateAgentToken,
  touchAgentToken,
} from '../services/admin/agent-token-admin.service.js';
import type { AppEnv } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { verifyToken } from '../utils/jwt.js';
import { loadUser, readBearer } from './auth.js';

/** Agent 令牌固定前缀，用于与普通登录 JWT 区分。 */
const AGENT_TOKEN_PREFIX = 'svt_';

/**
 * MCP 鉴权：优先 Agent 令牌（X-API-Key 或 Bearer），兼容管理员 JWT。
 * Agent 令牌以创建管理员身份执行，并记录最近使用时间。
 */
export const authenticateMcp = createMiddleware<AppEnv>(async (c, next) => {
  const apiKey = c.req.header('x-api-key')?.trim();
  const bearer = readBearer(c.req.header('authorization'));
  // 优先从 X-API-Key 识别 Agent 令牌，其次兼容放进 Bearer 的写法。
  const agentToken =
    apiKey?.startsWith(AGENT_TOKEN_PREFIX) === true
      ? apiKey
      : bearer?.startsWith(AGENT_TOKEN_PREFIX) === true
        ? bearer
        : null;

  if (agentToken) {
    const auth = await authenticateAgentToken(agentToken);
    if (!auth) {
      throw new HttpError(401, 'Agent 令牌无效、已吊销或已过期');
    }
    c.set('currentUser', auth.admin);
    c.set('agentToken', { id: auth.tokenId, scope: auth.scope });
    await touchAgentToken(auth.tokenId);
    await next();
    return;
  }

  if (!bearer) {
    throw new HttpError(401, '请提供 Agent 令牌（X-API-Key）或管理员 JWT');
  }

  const payload = await verifyToken(bearer);
  if (!payload) {
    throw new HttpError(401, '登录状态已失效，请重新登录');
  }
  const user = await loadUser(payload.userId);
  if (!user) {
    throw new HttpError(401, '账号不存在、已停用或已被删除');
  }
  c.set('currentUser', user);
  await next();
});
