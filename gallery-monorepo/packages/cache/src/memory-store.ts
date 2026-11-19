/**
 * 进程内缓存实现（MemoryStore）。
 *
 * 使用 Map 保存字符串键值，支持 TTL 惰性过期与定时清理；
 * 适合单实例部署与本地开发，不跨进程共享，重启即丢失。
 * 计数依赖 Node 单线程执行模型的原子性，无需额外锁。
 */
import type { CacheStore } from './types.js';

interface MemoryEntry {
  value: string;
  /** 过期时间戳（毫秒）；null 表示永不过期。 */
  expiresAt: number | null;
}

/** 内存后端配置。 */
export interface MemoryStoreOptions {
  /** 最大条目数，超出后按插入顺序淘汰。默认 10000。 */
  maxEntries?: number;
  /** 后台清理间隔（毫秒），默认 60 秒。 */
  cleanupIntervalMs?: number;
}

/**
 * 进程内缓存：适合单实例部署与本地开发，不跨进程共享。
 *
 * 过期采用「读取时惰性删除 + 定时扫描」双策略，不会触发主动淘汰通知。
 * 定时器调用 `unref`，不会阻止进程退出；`close` 时清除定时器与全部条目。
 */
export class MemoryStore implements CacheStore {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly maxEntries: number;
  private readonly timer: NodeJS.Timeout;

  constructor(options: MemoryStoreOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 10_000);
    this.timer = setInterval(() => this.sweep(), options.cleanupIntervalMs ?? 60_000);
    this.timer.unref();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
    this.evictOverflow();
  }

  async del(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.entries.delete(key);
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  /**
   * 固定窗口自增：键不存在或已过期时以 1 新建并设置 TTL；
   * 已存在时计数 +1，且不重置原有过期时间（保持窗口固定）。
   * Node 单线程下「读 + 写」之间不会被打断，计数天然原子。
   */
  async increment(key: string, ttlSeconds: number): Promise<{ count: number; ttl: number }> {
    const now = Date.now();
    const entry = this.entries.get(key);
    const alive = entry && (entry.expiresAt === null || entry.expiresAt > now);

    if (!alive) {
      const expiresAt = now + ttlSeconds * 1000;
      this.entries.set(key, { value: '1', expiresAt });
      this.evictOverflow();
      return { count: 1, ttl: ttlSeconds };
    }

    const count = Number(entry.value) + 1;
    let expiresAt = entry.expiresAt;
    if (expiresAt === null) {
      expiresAt = now + ttlSeconds * 1000;
    }
    this.entries.set(key, { value: String(count), expiresAt });
    return { count, ttl: Math.max(1, Math.ceil((expiresAt - now) / 1000)) };
  }

  /** 遍历 Map 删除匹配前缀的键，返回删除数量（仅适合条目量可控的场景）。 */
  async deleteByPrefix(prefix: string): Promise<number> {
    let removed = 0;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    this.entries.clear();
  }

  /** 定期清理已过期条目（后台定时器调用）。 */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  /** 超出条目上限时按插入顺序淘汰最旧的键（FIFO，不区分是否热点）。 */
  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      this.entries.delete(oldest);
    }
  }
}
