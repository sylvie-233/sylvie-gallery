/**
 * 存储层公开类型定义。
 *
 * 仅描述配置、上传结果与对象元信息，不包含任何运行时实现；
 * 配置中的敏感字段（密钥等）由调用方从自身环境注入，本包不读取 env。
 */

/**
 * 对象存储连接与行为配置。由调用方从自身环境变量读取后传入。
 *
 * `endpoint` 与 `bucket` 为必填项：前者为空或 bucket 为空时构造实例会直接抛错。
 * URL 解析规则见 `urlBuilder` / `publicBaseUrl` 的优先级说明。
 */
export interface StorageOptions {
  /** S3 兼容服务地址，如 http://127.0.0.1:9000。 */
  endpoint: string;
  /** S3 区域；RustFS / MinIO 通常任意值即可，默认 `us-east-1`。 */
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** RustFS / MinIO 等本地部署通常需要 path-style 访问；未显式传入时默认 `true`。 */
  forcePathStyle?: boolean;
  /** 对象公开访问的基础域名（末尾斜杠会被去除）；仅在未提供 `urlBuilder` 时生效。 */
  publicBaseUrl?: string;
  /** 自定义 URL 规则（如走 API 代理 `/api/files/:key`），优先级高于 publicBaseUrl。 */
  urlBuilder?: (key: string) => string;
  /** 上传时默认的 Cache-Control；未传入时使用 `public, max-age=31536000, immutable`。 */
  cacheControl?: string;
}

/**
 * 上传结果。
 *
 * `url` 由 `resolveUrl` 按 `urlBuilder` / `publicBaseUrl` 规则解析，
 * 不是对象存储的真实后端地址；`size` 取自本次上传的字节数。
 */
export interface PutResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

/**
 * 读取到的对象。
 *
 * `body` 优先转换为 Web Stream（便于直接作为响应体返回），
 * 运行环境不支持时回退为字节数组；`contentLength` 可能缺失。
 */
export interface StoredObject {
  body: ReadableStream | Uint8Array;
  contentType: string;
  contentLength: number | undefined;
}

/** 对象元信息（`head` 的结果）；对象不存在时整个返回值为 null，各字段也可能缺失。 */
export interface ObjectInfo {
  size: number | null;
  contentType: string | null;
  lastModified: Date | null;
  etag: string | null;
}

/** 单次上传选项；不传 `cacheControl` 时使用实例级默认值。 */
export interface PutOptions {
  cacheControl?: string;
}
