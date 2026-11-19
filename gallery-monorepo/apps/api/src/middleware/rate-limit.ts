import { createHash } from 'node:crypto';

import { createMiddleware } from 'hono/factory';

import { cache } from '../cache/index.js';
import { env } from '../config/env.js';
import type { AppContext, AppEnv } from '../types/context.js';
import { failure } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { getRequestIp } from '../utils/request.js';

const RATE_LIMIT_MESSAGE = '请求过于频繁，请稍后再试';

/** 客户端标识：优先反代头，缺失时归为 unknown。 */
export function requestIp(c: AppContext): string {
  return getRequestIp(c) ?? 'unknown';
}

/** 对账号等敏感标识做哈希，避免邮箱明文进入缓存键。 */
export function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

/** 读取请求体字段（不消费原始请求体），用于按账号限流。 */
export async function readJsonField(c: AppContext, field: string): Promise<string> {
  try {
    const body = (await c.req.raw.clone().json()) as Record<string, unknown> | null;
    const value = body?.[field];
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

export interface RateLimitOptions {
  /** 规则名，参与缓存键，便于区分不同接口。 */
  name: string;
  limit: number;
  windowSeconds: number;
  /** 返回限流标识；返回空字符串或 null 时跳过限流。 */
  key: (c: AppContext) => string | null | Promise<string | null>;
  message?: string;
  /** 满足条件时跳过限流。 */
  skip?: (c: AppContext) => boolean;
}

/**
 * 固定窗口限流中间件。
 * 缓存不可用时放行请求，避免限流组件故障导致整站不可用。
 */
export function rateLimit(options: RateLimitOptions) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (env.RATE_LIMIT_ENABLED !== 'true' || options.skip?.(c)) {
      await next();
      return;
    }

    try {
      const identifier = await options.key(c);
      if (!identifier) {
        await next();
        return;
      }

      const result = await cache.rateLimit(
        `${options.name}:${identifier}`,
        options.limit,
        options.windowSeconds,
      );

      c.header('X-RateLimit-Limit', String(result.limit));
      c.header('X-RateLimit-Remaining', String(result.remaining));
      c.header(
        'X-RateLimit-Reset',
        String(Math.floor(Date.now() / 1000) + result.resetSeconds),
      );

      if (!result.allowed) {
        c.header('Retry-After', String(result.resetSeconds));
        (c.get('logger') ?? logger).warn('触发限流', {
          rule: options.name,
          key: identifier.slice(0, 48),
          path: c.req.path,
        });
        return failure(c, 429, options.message ?? RATE_LIMIT_MESSAGE);
      }
    } catch (error) {
      (c.get('logger') ?? logger).error('限流检查失败，已放行请求', error, {
        rule: options.name,
      });
    }

    await next();
  });
}

/** 全局接口限流：静态资源、文档与 MCP 长连接不计入。 */
export const globalRateLimit = rateLimit({
  name: 'global',
  limit: 300,
  windowSeconds: 60,
  key: (c) => requestIp(c),
  skip: (c) =>
    c.req.path.startsWith('/api/files/') ||
    c.req.path === '/api/docs' ||
    c.req.path === '/api/openapi.json' ||
    c.req.path.startsWith('/api/mcp'),
});

/** 前台登录：IP 与账号双维度限制。 */
export const loginIpLimit = rateLimit({
  name: 'login:ip',
  limit: 10,
  windowSeconds: 300,
  key: (c) => requestIp(c),
});
export const loginAccountLimit = rateLimit({
  name: 'login:account',
  limit: 5,
  windowSeconds: 900,
  key: async (c) => {
    const email = await readJsonField(c, 'email');
    return email ? hashIdentifier(email) : null;
  },
});

/** 后台登录：单独计数，避免与前台登录互相挤占。 */
export const adminLoginIpLimit = rateLimit({
  name: 'admin-login:ip',
  limit: 10,
  windowSeconds: 300,
  key: (c) => requestIp(c),
});
export const adminLoginAccountLimit = rateLimit({
  name: 'admin-login:account',
  limit: 5,
  windowSeconds: 900,
  key: async (c) => {
    const email = await readJsonField(c, 'email');
    return email ? hashIdentifier(email) : null;
  },
});

/** 发送验证码：IP 宽松、单邮箱严格。 */
export const sendCodeIpLimit = rateLimit({
  name: 'send-code:ip',
  limit: 5,
  windowSeconds: 600,
  key: (c) => requestIp(c),
});
export const sendCodeEmailLimit = rateLimit({
  name: 'send-code:email',
  limit: 1,
  windowSeconds: 60,
  key: async (c) => {
    const email = await readJsonField(c, 'email');
    return email ? hashIdentifier(email) : null;
  },
  message: '验证码发送过于频繁，请稍后再试',
});

/** 注册：按 IP 限制。 */
export const registerIpLimit = rateLimit({
  name: 'register:ip',
  limit: 5,
  windowSeconds: 3600,
  key: (c) => requestIp(c),
});

/** 需要登录的写操作：按用户限制。 */
function userKey(c: AppContext): string | null {
  const user = c.get('currentUser');
  return user ? String(user.id) : null;
}

export const commentLimit = rateLimit({
  name: 'comment:user',
  limit: 5,
  windowSeconds: 600,
  key: userKey,
  message: '评论过于频繁，请稍后再试',
});

export const unlockLimit = rateLimit({
  name: 'unlock:user',
  limit: 10,
  windowSeconds: 600,
  key: userKey,
  message: '解锁操作过于频繁，请稍后再试',
});

export const downloadLimit = rateLimit({
  name: 'download:user',
  limit: 10,
  windowSeconds: 600,
  key: userKey,
  message: '下载过于频繁，请稍后再试',
});
