/** 缓存后端。 */
export type CacheDriver = 'memory' | 'redis';

/** Redis 连接参数。 */
export interface RedisConnectionOptions {
  /** 完整连接串（redis://user:pass@host:port/db），优先于 host/port。 */
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  /** 连接超时（毫秒）。 */
  connectTimeoutMs?: number;
}

/** 创建缓存实例的配置。 */
export interface CacheOptions {
  driver: CacheDriver;
  /** 键前缀，避免多服务共用 Redis 时冲突。 */
  prefix?: string;
  /** 默认 TTL（秒），未显式指定时使用。 */
  defaultTtlSeconds?: number;
  /** 内存后端最大条目数。 */
  maxEntries?: number;
  /** Redis 参数（driver=redis 时必填）。 */
  redis?: RedisConnectionOptions;
}

/** 底层存储接口：值统一为字符串，由 Cache 负责 JSON 序列化。 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  has(key: string): Promise<boolean>;
  /** 自增计数并返回当前窗口剩余 TTL（秒）。 */
  increment(key: string, ttlSeconds: number): Promise<{ count: number; ttl: number }>;
  /** 删除匹配前缀的全部键，返回删除数量。 */
  deleteByPrefix(prefix: string): Promise<number>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/** 限流结果。 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** 当前窗口剩余秒数。 */
  resetSeconds: number;
}
