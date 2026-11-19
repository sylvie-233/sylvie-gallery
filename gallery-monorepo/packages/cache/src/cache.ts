/**
 * 缓存门面实现。
 *
 * 职责与降级边界：
 * - 键前缀：所有键经 `fullKey` 拼为 `prefix:key`，`deleteByPrefix` 使用同样规则；
 * - 序列化：值统一 JSON 序列化，读取时反序列化，写入 undefined 等不可序列化值会由上层避免；
 * - 降级：后端读写 / 删除异常时按未命中或空操作处理，缓存故障不阻断业务；
 * - 防击穿：`remember` 在进程内合并相同键的并发加载；
 * - 限流：固定窗口计数，键空间独立为 `rl:` 前缀。
 */
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

  /**
   * 创建门面实例。
   *
   * 一般不直接调用，优先使用 `createCache(options)`；需要自定义后端时可传入 `CacheStore` 实现。
   * `prefix` 会 trim，空字符串表示不加前缀；`defaultTtlSeconds` 默认 60 秒。
   */
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

  /**
   * 写入并 JSON 序列化。
   *
   * 未显式传 `ttlSeconds` 时使用默认 TTL；写入失败静默忽略，不影响主流程。
   */
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

  /**
   * 删除一个或多个键（自动补全前缀）。
   *
   * 删除失败静默忽略，最多导致短暂脏读，由 TTL 兜底；空参数直接返回。
   */
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

  /** 键是否存在；后端异常时按不存在处理。 */
  async has(key: string): Promise<boolean> {
    try {
      return await this.store.has(this.fullKey(key));
    } catch {
      return false;
    }
  }

  /**
   * 缓存优先读取：命中直接返回；未命中时执行 loader 并写回，
   * 同进程内相同键的并发请求只会执行一次 loader（单飞）。
   *
   * - 只在 `cached === null` 时加载，因此缓存值为 `null` 也会被视为未命中；
   * - loader 返回 `undefined` 时不写回缓存；
   * - 单飞仅限当前进程；Redis 模式下多实例仍各自合并，必要时需额外分布式锁。
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

  /**
   * 自增计数（固定窗口），返回当前计数与剩余 TTL。
   *
   * 键空间独立为 `rl:<key>`，避免与普通缓存键冲突；本方法不吞异常，
   * 后端不可用时由调用方（如 `rateLimit` 的使用者）决定放行策略。
   */
  increment(key: string, ttlSeconds: number): Promise<{ count: number; ttl: number }> {
    return this.store.increment(this.fullKey(`rl:${key}`), ttlSeconds);
  }

  /**
   * 固定窗口限流：判断本次请求是否放行。
   *
   * 窗口内第 1 次请求创建计数键并设置 TTL，后续自增不重置窗口；
   * `count <= limit` 放行。Redis 用 Lua 原子完成 INCR + TTL。
   * 注意本方法不捕获异常：后端故障时异常向上抛出，由调用方决定是否放行。
   */
  async rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const { count, ttl } = await this.increment(key, windowSeconds);
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }

  /**
   * 按逻辑前缀批量失效，如 `albums` 会清除 `prefix:albums:*`。
   *
   * 前缀会自动补全实例前缀并追加冒号，因此不会误删 `albums-stat` 这类同前缀键；
   * 内存后端遍历 Map，Redis 使用 `SCAN + UNLINK` 分批删除。
   * 删除失败静默返回 0，不影响业务；返回值为实际删除数量。
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    try {
      return await this.store.deleteByPrefix(`${this.fullKey(prefix)}:`);
    } catch {
      return 0;
    }
  }

  /** 探测后端是否可用；具体实现可能吞掉异常，适合健康检查。 */
  ping(): Promise<boolean> {
    return this.store.ping();
  }

  /** 关闭后端连接并释放资源（如内存清理定时器、Redis 连接）。 */
  close(): Promise<void> {
    return this.store.close();
  }
}

/**
 * 按配置创建缓存实例。
 *
 * `driver=redis` 时使用 `RedisStore`（`redis` 参数缺省则连本地默认实例），
 * 否则使用 `MemoryStore`；`prefix` / `defaultTtlSeconds` 透传给门面。
 */

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
