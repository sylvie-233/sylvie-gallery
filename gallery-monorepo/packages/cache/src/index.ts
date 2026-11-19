/**
 * @sylvie/cache 公共入口。
 *
 * 对外导出缓存配置 / 结果类型、统一门面 `Cache` 与工厂 `createCache`，
 * 以及内存 / Redis 两种底层实现（通常只需通过门面使用）。
 */
export * from './types.js';
export { Cache, createCache } from './cache.js';
export { MemoryStore } from './memory-store.js';
export { RedisStore } from './redis-store.js';
