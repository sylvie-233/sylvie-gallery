/**
 * 缓存层公开类型定义。
 *
 * 定义门面配置、底层存储接口与限流结果；底层存储只处理字符串，
 * 对象序列化 / 反序列化统一由 `Cache` 门面负责。
 */

/** 缓存后端：`memory` 为进程内实现，`redis` 可跨实例共享。 */
export type CacheDriver = 'memory' | 'redis';

/**
 * Redis 连接参数。
 *
 * 提供 `url` 时优先使用完整连接串，否则按 host / port / password / db 分项连接；
 * 未给出的字段在底层实现中回退到默认值（127.0.0.1:6379 / db 0）。
 */
export interface RedisConnectionOptions {
  /** 完整连接串（redis://user:pass@host:port/db），优先于 host/port。 */
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  /** 连接超时（毫秒），默认 3000。 */
  connectTimeoutMs?: number;
}

/** 创建缓存实例的配置。 */
export interface CacheOptions {
  driver: CacheDriver;
  /** 键前缀，避免多服务共用 Redis 时冲突；门面会拼接为 `prefix:key`。 */
  prefix?: string;
  /** 默认 TTL（秒），默认 60；调用 `set` 未显式传 TTL 时使用。 */
  defaultTtlSeconds?: number;
  /** 内存后端最大条目数，默认 10000，超出按插入顺序淘汰。 */
  maxEntries?: number;
  /** Redis 参数（driver=redis 时使用；缺省时连接本地默认实例）。 */
  redis?: RedisConnectionOptions;
}

/**
 * 底层存储接口：值统一为字符串，由 Cache 负责 JSON 序列化。
 *
 * 实现方只关心键值存取与计数原子性，不感知业务对象结构；
 * 门面在读写异常时按未命中 / 空操作降级。
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  has(key: string): Promise<boolean>;
  /**
   * 自增计数并返回当前窗口剩余 TTL（秒）。
   *
   * 固定窗口语义：键首次创建时设置过期时间，后续自增不重置窗口。
   * Redis 实现通过 Lua 保证 INCR + TTL 原子执行。
   */
  increment(key: string, ttlSeconds: number): Promise<{ count: number; ttl: number }>;
  /** 删除匹配前缀的全部键（调用方传入的门面全键前缀），返回删除数量。 */
  deleteByPrefix(prefix: string): Promise<number>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/** 固定窗口限流结果。 */
export interface RateLimitResult {
  /** 本次请求是否放行（`count <= limit`）。 */
  allowed: boolean;
  /** 窗口内允许的最大次数。 */
  limit: number;
  /** 剩余可用次数，最小为 0。 */
  remaining: number;
  /** 当前窗口剩余秒数。 */
  resetSeconds: number;
}
