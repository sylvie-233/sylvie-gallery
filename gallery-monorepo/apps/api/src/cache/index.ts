/**
 * 缓存实例装配：按环境选择 Redis / 进程内存后端，
 * 并提供缓存键拼接、防击穿读取与按前缀失效的薄封装。
 */
import { createCache, type Cache } from '@sylvie/cache';

import { env } from '../config/env.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('cache');

/** 应用级缓存实例：生产使用 Redis，本地可切回进程内存。 */
export const cache: Cache = createCache({
  driver: env.CACHE_DRIVER,
  prefix: env.CACHE_PREFIX,
  defaultTtlSeconds: env.CACHE_DEFAULT_TTL,
  redis:
    env.CACHE_DRIVER === 'redis'
      ? {
          url: env.REDIS_URL || undefined,
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD || undefined,
          db: env.REDIS_DB,
        }
      : undefined,
});

/** 拼接缓存键：cacheKey('albums', 'list', 1) => albums:list:1。 */
export function cacheKey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(':');
}

/** 缓存优先读取，未命中时执行 loader 并写回。 */
export function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  return cache.remember(key, ttlSeconds, loader);
}

/** 按逻辑前缀清理缓存；失败只记录日志，不影响业务。 */
export async function invalidateCache(...prefixes: string[]): Promise<void> {
  await Promise.all(
    prefixes.map(async (prefix) => {
      try {
        const removed = await cache.deleteByPrefix(prefix);
        if (removed > 0) {
          log.debug('缓存已失效', { prefix, removed });
        }
      } catch (error) {
        log.warn('缓存失效失败', error, { prefix });
      }
    }),
  );
}
