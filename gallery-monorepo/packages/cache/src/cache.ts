import { MemoryStore } from './memory-store.js';
import { RedisStore } from './redis-store.js';
import type { CacheOptions, CacheStore, RateLimitResult } from './types.js';

/**
 * 统一缓存门面：负责键前缀、JSON 序列化、缓存击穿保护与限流计数。
 * 业务代码只依赖该类，切换内存 / Redis 不需要改调用方。
 */
export class Cache {
  private readonly store: CacheStore;
  private readonly prefix: string;
  private readonly defaultTtlSeconds: number;
  /** 同进程内的并发加载合并，避免缓存过期瞬间打满数据库。 */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    store: CacheStore,
    options: Pick<CacheOptions, 'prefix' | 'defaultTtlSeconds'> = {},
  ) {
    this.store = store;
    this.prefix = options.prefix?.trim() ?? '';
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? 60;
  }

  private fullKey(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  /**
   * 读取并反序列化；键不存在、内容损坏或后端不可用时返回 null。
   * 缓存故障按未命中处理，不阻断业务。
   */
  async get<T>(key: string): Promise<T | null> {
    const full = this.fullKey(key);
    let raw: string | null;
    try {
      raw = await this.store.get(full);
    } catch {
      return null;
    }
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      await this.del(key);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      await this.store.set(
        this.fullKey(key),
        JSON.stringify(value),
        ttlSeconds ?? this.defaultTtlSeconds,
      );
    } catch {
      // 写入失败不影响主流程。
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    try {
      await this.store.del(keys.map((key) => this.fullKey(key)));
    } catch {
      // 删除失败最多导致短暂脏读，由 TTL 兜底。
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      return await this.store.has(this.fullKey(key));
    } catch {
      return false;
    }
  }

  /**
   * 缓存优先读取：命中直接返回；未命中时执行 loader 并写回，
   * 同进程内相同键的并发请求只会执行一次 loader。
   */
  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const full = this.fullKey(key);
    const pending = this.inflight.get(full);
    if (pending) {
      return pending as Promise<T>;
    }

    const task = (async () => {
      const value = await loader();
      if (value !== undefined) {
        await this.set(key, value, ttlSeconds);
      }
      return value;
    })();

    this.inflight.set(full, task);
    try {
      return await task;
    } finally {
      this.inflight.delete(full);
    }
  }

  /** 自增计数（固定窗口），返回当前计数与剩余 TTL。 */
  increment(key: string, ttlSeconds: number): Promise<{ count: number; ttl: number }> {
    return this.store.increment(this.fullKey(`rl:${key}`), ttlSeconds);
  }

  /** 固定窗口限流：判断本次请求是否放行。 */
  async rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const { count, ttl } = await this.increment(key, windowSeconds);
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }

  /** 按逻辑前缀批量失效，如 `albums` 会清除 `prefix:albums:*`。 */
  async deleteByPrefix(prefix: string): Promise<number> {
    try {
      return await this.store.deleteByPrefix(`${this.fullKey(prefix)}:`);
    } catch {
      return 0;
    }
  }

  ping(): Promise<boolean> {
    return this.store.ping();
  }

  close(): Promise<void> {
    return this.store.close();
  }
}

/** 按配置创建缓存实例。 */
export function createCache(options: CacheOptions): Cache {
  const store =
    options.driver === 'redis'
      ? new RedisStore(options.redis)
      : new MemoryStore({ maxEntries: options.maxEntries });

  return new Cache(store, {
    prefix: options.prefix,
    defaultTtlSeconds: options.defaultTtlSeconds,
  });
}
