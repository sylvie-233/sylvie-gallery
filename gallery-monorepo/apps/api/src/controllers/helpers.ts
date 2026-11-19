import type { AppContext, AuthUser } from '../types/context.js';
import { HttpError } from '../utils/http.js';

/** 取当前登录用户；受保护接口由鉴权中间件保证存在。 */
export function requireUser(c: AppContext): AuthUser {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  return user;
}

/** 取当前登录用户（可选鉴权接口）。 */
export function currentUser(c: AppContext): AuthUser | undefined {
  return c.get('currentUser');
}

/** 取客户端来源 IP（优先反代头）。 */
export function clientIp(c: AppContext): string | undefined {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }
  return c.req.header('x-real-ip') ?? undefined;
}
