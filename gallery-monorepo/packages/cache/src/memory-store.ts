import type { CacheStore } from './types.js';

interface MemoryEntry {
  value: string;
  /** 过期时间戳（毫秒）；null 表示永不过期。 */
  expiresAt: number | null;
}

export interface MemoryStoreOptions {
  /** 最大条目数，超出后按插入顺序淘汰。默认 10000。 */
  maxEntries?: number;
  /** 后台清理间隔（毫秒），默认 60 秒。 */
  cleanupIntervalMs?: number;
}

/** 进程内缓存：适合单实例部署与本地开发，不跨进程共享。 */
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

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

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
