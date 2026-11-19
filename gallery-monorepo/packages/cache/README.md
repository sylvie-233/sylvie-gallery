# @sylvie/cache

共享缓存层，支持 **内存** 与 **Redis** 两种后端，内置限流计数与缓存击穿保护。

## 使用

```ts
import { createCache } from '@sylvie/cache';

// 本地 / 单实例
const cache = createCache({ driver: 'memory', prefix: 'sylvie' });

// 生产：多实例共享
const cache = createCache({
  driver: 'redis',
  prefix: 'sylvie',
  defaultTtlSeconds: 60,
  redis: { host: '127.0.0.1', port: 6379, db: 0 },
});

await cache.set('site:config', { title: '希尔薇图集' }, 300);
await cache.get('site:config');

// 缓存优先 + 同进程并发合并
const data = await cache.remember('albums:list:1', 30, () => loadAlbums(1));

// 固定窗口限流
const result = await cache.rateLimit('login:ip:1.2.3.4', 10, 300);
// { allowed, limit, remaining, resetSeconds }

// 按前缀清理（如写操作后）
await cache.deleteByPrefix('albums');

await cache.close();
```

## 设计要点

- **统一接口**：`Cache` 门面负责键前缀、JSON 序列化与降级，切换后端无需改业务代码。
- **故障降级**：读写 / 删除失败按未命中或空操作处理，缓存故障不阻断业务；限流计数失败由调用方决定放行（API 默认放行）。
- **防击穿**：`remember` 在进程内合并相同键的并发加载；Redis 模式下多实例仍各自合并，必要时可再加分布式锁。
- **原子限流**：Redis 通过 Lua 脚本一次完成 `INCR + TTL`，多实例计数一致；内存后端依赖 Node 单线程原子性。
- **前缀失效**：内存遍历 Map，Redis 使用 `SCAN + UNLINK`，适合缓存键数量可控的业务场景。
- **连接策略**：Redis 关闭离线队列，连接不可用时快速失败；断线后按退避策略自动重连。
- **内存淘汰**：默认最多 10,000 条，超出按插入顺序淘汰，并每 60 秒清理过期键（定时器 `unref`，不阻塞进程退出）。

## 配置

| 选项 | 说明 |
|---|---|
| `driver` | `memory` / `redis` |
| `prefix` | 键前缀，多服务共用 Redis 时必填 |
| `defaultTtlSeconds` | 默认 TTL，默认 60 |
| `maxEntries` | 内存后端最大条目数，默认 10000 |
| `redis.url` | 完整连接串，优先于 host/port |
| `redis.host` / `port` / `password` / `db` | 分项连接参数 |
