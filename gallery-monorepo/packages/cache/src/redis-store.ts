/**
 * Redis 缓存实现（RedisStore）。
 *
 * 可跨实例共享，适合生产多副本部署；连接采用懒连接 + 快速失败策略，
 * 断线后按退避重连。连接不可用时操作会抛错，由 `Cache` 门面降级处理。
 * 限流计数通过 Lua 脚本保证 INCR 与 TTL 的原子性。
 */
import Redis from 'ioredis';

import type { CacheStore, RedisConnectionOptions } from './types.js';

/**
 * 自增并返回剩余 TTL：首次写入时设置过期，不打断已有窗口。
 *
 * 返回值形如 `[count, ttl]`；`TTL < 0` 表示键无过期（首次或异常状态），此时补设窗口，
 * 从而保证同一窗口内后续自增不会延长计数周期。
 */
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

/**
 * Redis 缓存：可跨实例共享，适合生产环境。
 *
 * 连接参数优先使用 `url`，否则按 host / port / password / db 分项连接；
 * 构造时开始异步连接，失败不会同步抛出（后续操作快速失败）。
 */
export class RedisStore implements CacheStore {
  private readonly client: IncrCommandClient;

  /**
   * 创建 Redis 后端。
   *
   * 关键连接策略：
   * - `lazyConnect` 后立即主动 connect，避免首次操作才建连；
   * - `enableOfflineQueue=false`：连接不可用时立即失败，避免请求堆积；
   * - `maxRetriesPerRequest=1` 限制单命令重试次数；
   * - `retryStrategy` 以 200ms 起、最多 2s 的退避持续重连。
   *
   * 监听 `error` 事件避免未捕获异常；同时注册 `incrWithTtl` Lua 命令。
   */
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

  /** 通过 Lua 脚本原子完成自增与窗口 TTL 设置，多实例下计数一致。 */
  async increment(key: string, ttlSeconds: number): Promise<{ count: number; ttl: number }> {
    const [count, ttl] = await this.client.incrWithTtl(key, ttlSeconds);
    return { count: Number(count), ttl: Number(ttl) };
  }

  /**
   * 使用 `SCAN` 游标分批匹配前缀（每批 200），再用 `UNLINK` 异步删除，避免阻塞 Redis。
   * 与 `KEYS` 不同，不会长时间锁定实例；返回累计删除数量。
   */
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

  /** 探测连接；异常吞掉并返回 false，供健康检查使用。 */
  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  /** 优雅关闭连接；QUIT 失败时直接断开，避免关闭流程抛错。 */
  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
