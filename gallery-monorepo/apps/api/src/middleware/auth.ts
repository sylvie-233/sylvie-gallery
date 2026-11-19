/**
 * 登录鉴权中间件：解析 Bearer JWT 并回查账号状态，向请求上下文注入 currentUser；
 * 提供强制登录、可选登录与管理员限定三种能力。
 */
import { createMiddleware } from 'hono/factory';

import type { Role } from '@sylvie/types';

import { dbClient } from '../db/index.js';
import type { AppEnv, AuthUser } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { verifyToken } from '../utils/jwt.js';

interface AuthUserRow {
  id: number;
  email: string;
  nickname: string;
  role: Role;
  status: number;
  isDeleted: number;
  vipExpireAt: string | null;
}

/** 按用户 ID 回查账号状态：停用/删除后 token 立即失效。 */
export async function loadUser(userId: number): Promise<AuthUser | null> {
  const row = await dbClient.queryOne<AuthUserRow>(
    `SELECT id, email, nickname, role, status, is_deleted AS isDeleted, vip_expire_at AS vipExpireAt
       FROM \`user\`
      WHERE id = ?
      LIMIT 1`,
    [userId],
  );

  if (!row || row.isDeleted === 1 || row.status !== 1) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    role: row.role,
    vipExpireAt: row.vipExpireAt,
  };
}

/** 从 Authorization 头解析 Bearer token；缺失或格式不符时返回 null。 */
export function readBearer(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? null;
}

/** 强制登录：无效 token、停用或删除账号一律拒绝。 */
export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  const token = readBearer(c.req.header('authorization'));
  if (!token) {
    throw new HttpError(401, '未登录或登录已过期');
  }

  const payload = await verifyToken(token);
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

/**
 * 可选登录：用于公开接口同时返回「是否已收藏 / 是否已订阅」等状态。
 * 无 token、token 无效或账号异常时按游客处理，不阻断请求。
 */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = readBearer(c.req.header('authorization'));
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      const user = await loadUser(payload.userId);
      if (user) {
        c.set('currentUser', user);
      }
    }
  }
  await next();
});

/** 读取当前登录用户；游客请求下返回 undefined。 */
export function getCurrentUser(c: { get: (key: 'currentUser') => AuthUser | undefined }): AuthUser | undefined {
  return c.get('currentUser');
}

/** 管理员限定：供后续管理后台复用。 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  if (user.role !== 'admin') {
    throw new HttpError(403, '仅管理员可执行此操作');
  }
  await next();
});
