/**
 * 控制器公共助手：从 Hono Context 读取登录用户与客户端 IP。
 * `currentUser` 由 authenticate / optionalAuth 中间件写入。
 */
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

/** 取客户端来源 IP：优先 X-Forwarded-For 的第一跳，其次 X-Real-IP。 */
export function clientIp(c: AppContext): string | undefined {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }
  return c.req.header('x-real-ip') ?? undefined;
}
