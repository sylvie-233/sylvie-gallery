/** 对象存储连接与行为配置。由调用方从自身环境变量读取后传入。 */
export interface StorageOptions {
  /** S3 兼容服务地址，如 http://127.0.0.1:9000。 */
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** RustFS / MinIO 等本地部署通常需要 path-style 访问。 */
  forcePathStyle?: boolean;
  /** 对象公开访问的基础域名；设置后 `resolveUrl` 优先使用它。 */
  publicBaseUrl?: string;
  /** 自定义 URL 规则（如走 API 代理 `/api/files/:key`），优先级高于 publicBaseUrl。 */
  urlBuilder?: (key: string) => string;
  /** 上传时默认的 Cache-Control。 */
  cacheControl?: string;
}

/** 上传结果。 */
export interface PutResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

/** 读取到的对象。 */
export interface StoredObject {
  body: ReadableStream | Uint8Array;
  contentType: string;
  contentLength: number | undefined;
}

/** 对象元信息（不存在时为 null）。 */
export interface ObjectInfo {
  size: number | null;
  contentType: string | null;
  lastModified: Date | null;
  etag: string | null;
}

/** 上传选项。 */
export interface PutOptions {
  cacheControl?: string;
}
