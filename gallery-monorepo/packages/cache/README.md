# @sylvie/cache

共享缓存层，支持 **内存** 与 **Redis** 两种后端，内置缓存击穿保护与固定窗口限流计数。配置由调用方注入，包内不读取环境变量。

## 定位

- 为各服务提供统一的键值缓存门面，切换后端不需要改业务代码。
- 在门面层统一处理键前缀、JSON 序列化与故障降级。
- 提供 `remember` 单飞加载与固定窗口限流，覆盖列表缓存、防击穿与敏感接口限流场景。

## 目录结构

```
packages/cache/
├── src/
│   ├── index.ts         # 公共出口
│   ├── cache.ts         # Cache 门面与 createCache 工厂
│   ├── types.ts         # 配置、CacheStore 接口与限流结果类型
│   ├── memory-store.ts  # 进程内实现（MemoryStore）
│   └── redis-store.ts   # Redis 实现（RedisStore）
├── package.json
├── tsconfig.json
└── README.md
```

## 引入方式

```jsonc
// apps/api/package.json
{
  "dependencies": {
    "@sylvie/cache": "workspace:*"
  }
}
```

```ts
import { createCache, Cache, MemoryStore, RedisStore } from '@sylvie/cache';
import type {
  CacheOptions,
  CacheStore,
  CacheDriver,
  RedisConnectionOptions,
  RateLimitResult,
} from '@sylvie/cache';
```

## 快速开始

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
await cache.get('site:config');        // 不存在 / 损坏 / 后端故障时返回 null

// 缓存优先 + 同进程并发合并
const data = await cache.remember('albums:list:1', 30, () => loadAlbums(1));

// 固定窗口限流
const result = await cache.rateLimit('login:ip:1.2.3.4', 10, 300);
// { allowed, limit, remaining, resetSeconds }

// 按前缀清理（如写操作后）
await cache.deleteByPrefix('albums');

await cache.close();
```

## API 概览

| 成员 | 签名 | 说明 |
|---|---|---|
| `createCache` | `(options: CacheOptions) => Cache` | 按配置创建门面实例 |
| `get` | `<T>(key: string) => Promise<T \| null>` | 读取并反序列化；未命中 / 损坏 / 故障返回 `null` |
| `set` | `<T>(key, value: T, ttlSeconds?: number) => Promise<void>` | 序列化写入；失败静默忽略 |
| `del` | `(...keys: string[]) => Promise<void>` | 删除一个或多个键；失败静默忽略 |
| `has` | `(key: string) => Promise<boolean>` | 键是否存在；故障按 `false` 处理 |
| `remember` | `<T>(key, ttlSeconds, loader: () => Promise<T>) => Promise<T>` | 缓存优先，未命中执行 loader 并写回；进程内单飞 |
| `increment` | `(key, ttlSeconds) => Promise<{ count, ttl }>` | 固定窗口自增，键空间为 `rl:<key>`；不吞异常 |
| `rateLimit` | `(key, limit, windowSeconds) => Promise<RateLimitResult>` | 固定窗口限流；不吞异常，由调用方决定降级 |
| `deleteByPrefix` | `(prefix: string) => Promise<number>` | 删除实际键 `prefix:*`，返回数量；失败返回 `0` |
| `ping` | `() => Promise<boolean>` | 探测后端可用性 |
| `close` | `() => Promise<void>` | 关闭连接、清理定时器 |

底层实现 `MemoryStore` / `RedisStore` 同样从包根导出，均有 `get` / `set` / `del` / `has` / `increment` / `deleteByPrefix` / `ping` / `close`，值统一为字符串。

## 设计边界

- **统一接口**：`Cache` 门面负责键前缀（`prefix:key`）、JSON 序列化与降级，切换后端无需改业务代码。
- **故障降级**：`get` / `set` / `del` / `has` / `deleteByPrefix` 在读写失败时按未命中或空操作处理，缓存故障不阻断业务；`increment` / `rateLimit` 不吞异常，由调用方决定放行（API 默认放行）。
- **防击穿**：`remember` 在进程内合并相同键的并发加载；Redis 模式下多实例仍各自合并，需要全局单飞时再叠加分布式锁。
- **固定窗口限流**：窗口内首次计数时设置 TTL，后续自增不重置窗口；Redis 通过 Lua 一次完成 `INCR + TTL`，多实例计数一致；内存后端依赖 Node 单线程原子性。
- **前缀失效**：内存遍历 Map，Redis 使用 `SCAN + UNLINK`，适合缓存键数量可控的业务场景。
- **序列化约定**：值以 JSON 存储；缓存中不存在的值请用 `null` 表示，`remember` 只把 `null` 视为未命中，loader 返回 `undefined` 时不写回。
- **连接策略**：Redis 关闭离线队列、限制单命令重试，连接不可用时快速失败；断线后按退避自动重连。
- **内存淘汰**：默认最多 10,000 条，超出按插入顺序（FIFO）淘汰；每 60 秒清理过期键，定时器 `unref`，不阻塞进程退出。

## 配置项

`CacheOptions`：

| 选项 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `driver` | 是 | — | `memory` / `redis` |
| `prefix` | 否 | `''` | 键前缀；多服务共用 Redis 时必填，门面拼为 `prefix:key` |
| `defaultTtlSeconds` | 否 | `60` | 默认 TTL（秒），`set` 未显式传 TTL 时使用 |
| `maxEntries` | 否 | `10000` | 内存后端最大条目数，超出按插入顺序淘汰 |
| `redis` | `driver=redis` 时使用 | 本地默认实例 | Redis 连接参数，见下表 |

`RedisConnectionOptions`：

| 选项 | 说明 |
|---|---|
| `url` | 完整连接串 `redis://user:pass@host:port/db`，优先于分项参数 |
| `host` / `port` | 主机与端口，默认 `127.0.0.1:6379` |
| `password` / `db` | 密码与数据库编号，默认无密码 / `0` |
| `connectTimeoutMs` | 连接超时（毫秒），默认 `3000` |

## 与 API 集成位置

- 实例装配：`gallery-monorepo/apps/api/src/cache/index.ts`
  - 从 `env` 读取 `CACHE_DRIVER` / `CACHE_PREFIX` / `CACHE_DEFAULT_TTL`，Redis 模式额外读取 `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB`。
  - 导出 `cache` 实例与三个薄封装：
    - `cacheKey(...parts)`：拼接缓存键，如 `cacheKey('albums', 'list', 1)` → `albums:list:1`；
    - `cached(key, ttlSeconds, loader)`：转发到 `cache.remember`；
    - `invalidateCache(...prefixes)`：按前缀批量失效，失败只记日志。
- 限流中间件：`gallery-monorepo/apps/api/src/middleware/rate-limit.ts`
  - 所有敏感接口（登录、验证码、注册、评论、解锁、下载等）统一调用 `cache.rateLimit`；
  - 限流自身异常时记录错误并放行，避免缓存故障导致整站不可用。
- 缓存内容取舍：只缓存访客可复用的数据；登录用户带收藏 / 订阅状态的响应不缓存（`site:bootstrap` 除外）。
- 管理端写操作后，按域调用 `invalidateCache('albums', 'site')` 等清理相关前缀。

## 注意事项

- **前缀隔离**：多服务或多环境共用 Redis 时必须设置不同 `prefix`，否则 `deleteByPrefix` 可能误删。
- **`deleteByPrefix` 精确到冒号**：传 `albums` 只会命中 `prefix:albums:*`（实际键为 `prefix:albums:` 前缀），不会删除 `prefix:albums-stat`。
- **`rateLimit` 不降级**：后端异常会向上抛出；调用方需要自行 try/catch 并决定放行策略。
- **JSON 限制**：值必须可 JSON 序列化；`Date` 会变成字符串，`undefined` 字段会被丢弃，必要时自行约定格式。
- **内存后端不跨进程**：仅适合单实例或本地开发，多副本部署请使用 Redis。
- **键数量可控**：`RedisStore.deleteByPrefix` 使用 `SCAN` 分批扫描，但全库扫描仍有成本，避免对超大键空间频繁调用。
- **关闭连接**：进程退出前调用 `close()`；内存后端会同时停止过期清理定时器。
