# @sylvie/storage

S3 / RustFS 对象存储的共享封装。配置由调用方注入，包内不读取环境变量、不依赖业务框架，可直接复制到其它服务。

## 使用

```ts
import { createStorage } from '@sylvie/storage';

export const storage = createStorage({
  endpoint: 'http://127.0.0.1:9000',
  region: 'us-east-1',
  accessKeyId: 'rustfsadmin',
  secretAccessKey: 'rustfsadmin',
  bucket: 'sylvie',
  forcePathStyle: true,
  // 方式一：公开域名
  publicBaseUrl: 'https://cdn.example.com',
  // 方式二：自定义 URL 规则（优先级更高），如走 API 代理
  // urlBuilder: (key) => `/api/files/${key}`,
});

await storage.ensureBucket();          // 桶不存在则创建，返回是否新建
await storage.isHealthy();             // 桶是否可访问
await storage.put('a/b.jpg', bytes, 'image/jpeg');
await storage.get('a/b.jpg');          // 不存在返回 null
await storage.head('a/b.jpg');         // 元信息；不存在返回 null
await storage.size('a/b.jpg');         // 字节数；失败返回 null
await storage.exists('a/b.jpg');
await storage.delete('a/b.jpg');       // 幂等
storage.resolveUrl('a/b.jpg');
```

## 设计边界

- **只做对象存储**：图片压缩、加水印、视频转码等业务处理不在此包内。
- **配置注入**：调用方从自己的 env / 配置中心读取参数，便于多服务复用与测试。
- **URL 规则可插拔**：`urlBuilder` 优先于 `publicBaseUrl`；两者都没有时返回原始 key。
- **错误语义**：`get` / `head` 在对象不存在时返回 `null`，其它错误继续抛出；`delete` 幂等。
- 底层 S3 客户端可通过 `storage.client` 访问，用于特殊场景（如预签名 URL）。
