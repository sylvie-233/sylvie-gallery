import Redis from 'ioredis';

import type { CacheStore, RedisConnectionOptions } from './types.js';

/** 自增并返回剩余 TTL：首次写入时设置过期，不打断已有窗口。 */
const INCR_WITH_TTL_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

interface IncrCommandClient extends Redis {
  incrWithTtl(key: string, ttlSeconds: number): Promise<[number, number]>;
}

/** Redis 缓存：可跨实例共享，适合生产环境。 */
export class RedisStore implements CacheStore {
  private readonly client: IncrCommandClient;

  constructor(options: RedisConnectionOptions = {}) {
    const common = {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: options.connectTimeoutMs ?? 3000,
      // 断线后持续重连，避免 Redis 恢复后仍处于不可用状态。
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    } as const;

    this.client = (options.url
      ? new Redis(options.url, common)
      : new Redis({
          host: options.host ?? '127.0.0.1',
          port: options.port ?? 6379,
          password: options.password || undefined,
          db: options.db ?? 0,
          ...common,
        })) as IncrCommandClient;

    // 必须监听 error，否则连接异常会触发未捕获事件。
    this.client.on('error', () => undefined);
    this.client.defineCommand('incrWithTtl', {
      numberOfKeys: 1,
      lua: INCR_WITH_TTL_SCRIPT,
    });
    void this.client.connect().catch(() => undefined);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }
    await this.client.set(key, value);
  }

  async del(keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(key)) > 0;
  }

  async increment(key: string, ttlSeconds: number): Promise<{ count: number; ttl: number }> {
    const [count, ttl] = await this.client.incrWithTtl(key, ttlSeconds);
    return { count: Number(count), ttl: Number(ttl) };
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        removed += await this.client.unlink(...keys);
      }
    } while (cursor !== '0');
    return removed;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
