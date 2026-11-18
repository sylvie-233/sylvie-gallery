import type { Context } from 'hono';

import type { AppEnv } from '../types/context.js';
import { HttpError } from './http.js';

/** 取客户端来源 IP（优先反代头）。 */
export function getRequestIp(c: Context): string | undefined {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }
  return c.req.header('x-real-ip') ?? undefined;
}

/** 取当前管理员 ID；鉴权中间件保证存在。 */
export function currentAdminId(c: Context<AppEnv>): number {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  return user.id;
}
