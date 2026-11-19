# @sylvie/storage

S3 兼容对象存储（RustFS / MinIO / AWS S3）的共享封装。配置由调用方注入，包内不读取环境变量、不依赖业务框架，可直接复制到其它服务。

## 定位

- 为各服务提供统一的**对象级**存储访问：建桶、健康检查、上传、读取、元信息探测、删除。
- 只处理「字节与对象元数据」，**不处理图片**：压缩、水印、转码等业务逻辑留在调用方。
- URL 生成规则可插拔，既能直连 CDN，也能走 API 代理。

## 目录结构

```
packages/storage/
├── src/
│   ├── index.ts    # 公共出口：类型 + ObjectStorage + createStorage
│   ├── storage.ts  # ObjectStorage 实现与工厂函数
│   └── types.ts    # StorageOptions / PutResult / StoredObject / ObjectInfo
├── package.json
├── tsconfig.json
└── README.md
```

## 引入方式

在工作区应用中加入依赖：

```jsonc
// apps/api/package.json
{
  "dependencies": {
    "@sylvie/storage": "workspace:*"
  }
}
```

```ts
import { createStorage, ObjectStorage } from '@sylvie/storage';
import type { StorageOptions, PutResult, StoredObject, ObjectInfo } from '@sylvie/storage';
```

## 快速开始

```ts
import { createStorage } from '@sylvie/storage';

export const storage = createStorage({
  endpoint: 'http://127.0.0.1:9000',
  region: 'us-east-1',
  accessKeyId: 'rustfsadmin',
  secretAccessKey: 'rustfsadmin',
  bucket: 'sylvie',
  forcePathStyle: true,
  // 方式一：公开域名（CDN 或对象网关）
  publicBaseUrl: 'https://cdn.example.com',
  // 方式二：自定义 URL 规则（优先级更高），如走 API 代理
  // urlBuilder: (key) => `/api/files/${key}`,
});

await storage.ensureBucket();          // 桶不存在则创建，返回是否本次新建
await storage.isHealthy();             // 桶是否可访问（不抛错）
await storage.put('a/b.jpg', bytes, 'image/jpeg');
await storage.get('a/b.jpg');          // 不存在返回 null
await storage.head('a/b.jpg');         // 元信息；不存在返回 null
await storage.size('a/b.jpg');         // 字节数；不存在或探测失败返回 null
await storage.exists('a/b.jpg');       // 是否存在（基于 HEAD）
await storage.delete('a/b.jpg');       // 幂等
storage.resolveUrl('a/b.jpg');         // 按 URL 规则解析
```

## API 概览

| 成员 | 签名 | 说明 |
|---|---|---|
| `createStorage` | `(options: StorageOptions) => ObjectStorage` | 工厂函数，等价于 `new ObjectStorage(options)` |
| `ensureBucket` | `() => Promise<boolean>` | 桶不存在则创建；返回是否本次新建 |
| `isHealthy` | `() => Promise<boolean>` | HEAD 探测桶是否可访问，异常按 `false` 处理 |
| `resolveUrl` | `(key: string) => string` | 按 `urlBuilder` → `publicBaseUrl` → 原样 key 的优先级解析 |
| `put` | `(key, body: Uint8Array, contentType: string, options?: PutOptions) => Promise<PutResult>` | 上传对象，同 key 覆盖 |
| `get` | `(key: string) => Promise<StoredObject \| null>` | 读取内容与元信息；不存在返回 `null` |
| `head` | `(key: string) => Promise<ObjectInfo \| null>` | 读取元信息；不存在返回 `null` |
| `size` | `(key: string) => Promise<number \| null>` | 对象字节数；不存在或探测失败返回 `null` |
| `exists` | `(key: string) => Promise<boolean>` | 对象是否存在；非「不存在」错误会抛出 |
| `delete` | `(key: string) => Promise<void>` | 删除对象，幂等 |
| `bucket` | `string` | 当前桶名 |
| `client` | `S3Client` | 底层 S3 客户端，供预签名 URL 等特殊场景使用 |

## 设计边界

- **只做对象存储**：图片压缩、加水印、视频转码等业务处理不在此包内。
- **配置注入**：调用方从自己的 env / 配置中心读取参数，便于多服务复用与测试；包内不读环境变量。
- **URL 规则可插拔**：`urlBuilder` 优先于 `publicBaseUrl`；两者都没有时返回原始 key。
- **错误语义**：
  - `get` / `head` 在对象不存在时返回 `null`，其它错误继续抛出；
  - `size` 吞掉所有异常，探测失败也返回 `null`；
  - `delete` 幂等，对象不存在视为成功；
  - `ensureBucket` 对「桶已存在」视为成功，其它错误抛出。
- **不缓存、不重试**：本包不做本地缓存或自动重试，由调用方按场景处理。

## 配置项

`StorageOptions`：

| 选项 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `endpoint` | 是 | — | S3 兼容服务地址，如 `http://127.0.0.1:9000`；为空构造时抛错 |
| `region` | 是 | — | 区域；RustFS / MinIO 通常任意值即可 |
| `accessKeyId` | 是 | — | 访问密钥 ID |
| `secretAccessKey` | 是 | — | 访问密钥 |
| `bucket` | 是 | — | 桶名；为空构造时抛错 |
| `forcePathStyle` | 否 | `true` | 本地部署通常需要 path-style 访问 |
| `publicBaseUrl` | 否 | — | 公开访问基础域名，末尾斜杠会被去除 |
| `urlBuilder` | 否 | — | 自定义 URL 规则，优先级高于 `publicBaseUrl` |
| `cacheControl` | 否 | `public, max-age=31536000, immutable` | `put` 的默认 Cache-Control，可被 `PutOptions.cacheControl` 覆盖 |

URL 解析规则（`resolveUrl`）：

1. 配置了 `urlBuilder` → 使用其返回值；
2. 否则配置了 `publicBaseUrl` → `${publicBaseUrl}/${key}`；
3. 两者都没有 → 原样返回 `key`。

## 与 API 集成位置

- 实例装配：`gallery-monorepo/apps/api/src/services/storage.service.ts`
  - 从 `env` 读取 `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` / `S3_FORCE_PATH_STYLE` / `S3_PUBLIC_URL`。
  - 配置了 `S3_PUBLIC_URL` 时用 `publicBaseUrl`；未配置时用 `urlBuilder: (key) => /api/files/${key}`，由 API 代理按鉴权规则读取。
  - 导出 `ensureBucket()`、`storageHealthy()`、`uploadObject()`、`getObjectSize()`、`getObject()` 等薄封装。
- 启动建桶：API 启动时调用 `ensureBucket()`，RustFS 首次运行没有默认桶。
- 文件代理：`GET /api/files/:key` 使用 `getObject()` 读取并返回 Web Stream。
- 图片处理（Sharp 压缩 / 水印）留在 API 侧，不进入本包。

## 注意事项

- 本包**不读取环境变量**，请始终显式传入配置。
- `put` 需要完整字节数组（`Uint8Array`），流式上传不在本包范围内。
- `urlBuilder` 返回的地址不会做任何编码，key 中若含特殊字符需由调用方处理。
- `get` 的 `body` 在支持时是 Web Stream，否则为 `Uint8Array`，消费前请按类型判断。
- 凭据应通过环境变量或密钥管理注入，不要硬编码进仓库。
- 对象键建议使用稳定、可读的目录前缀（如 `albums/{id}/cover.jpg`），便于按前缀管理与后续迁移。
