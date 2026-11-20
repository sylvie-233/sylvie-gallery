/**
 * 存储层公开类型定义。
 *
 * 仅描述配置、后端接口、上传结果与对象元信息，不包含任何运行时实现；
 * 配置中的敏感字段（密钥等）由调用方从自身环境注入，本包不读取 env。
 */

/** 存储后端：`s3` 为 S3 兼容对象存储（RustFS / MinIO / AWS S3），`local` 为本地文件系统。 */
export type StorageDriver = 's3' | 'local';

/**
 * S3 后端连接与行为配置。由调用方从自身环境变量读取后传入。
 *
 * `endpoint` 与 `bucket` 为必填项：前者为空或 bucket 为空时构造实例会直接抛错。
 */
export interface S3StoreOptions {
  /** S3 兼容服务地址，如 http://127.0.0.1:9000。 */
  endpoint: string;
  /** S3 区域；RustFS / MinIO 通常任意值即可，调用方未传时默认 `us-east-1`。 */
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket: string;
  /** RustFS / MinIO 等本地部署通常需要 path-style 访问；未显式传入时默认 `true`。 */
  forcePathStyle?: boolean;
  /** 上传时默认的 Cache-Control；未传入时使用 `public, max-age=31536000, immutable`。 */
  cacheControl?: string;
}

/**
 * 本地文件后端配置。
 *
 * `bucket` 映射为 `rootDir` 下的命名空间子目录，对象键作为其相对路径，
 * 从而与 S3 后端的「桶 + 键」语义保持一致。
 */
export interface LocalStoreOptions {
  /** 文件根目录，为空构造时抛错。 */
  rootDir: string;
  /** 桶名，作为根目录下的子目录；为空或含路径分隔符时构造抛错。 */
  bucket: string;
}

/**
 * `createStorage` 的统一配置。
 *
 * `driver` 缺省为 `s3`，既有 S3 / RustFS 调用方无需改动；
 * 改用本地文件后端时传 `driver: 'local'` 与 `local.rootDir`。
 *
 * URL 解析规则见 `ObjectStorage.resolveUrl` 的优先级说明。
 */
export interface StorageOptions {
  /** 后端类型，默认 `s3`。 */
  driver?: StorageDriver;
  /** 桶名：S3 后端为真实桶，local 后端为根目录下的命名空间子目录。 */
  bucket: string;
  /** S3 服务地址，如 http://127.0.0.1:9000（driver=s3 时必填）。 */
  endpoint?: string;
  /** S3 区域（driver=s3 时使用），未传时默认 `us-east-1`。 */
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** RustFS / MinIO 等本地部署通常需要 path-style 访问；未显式传入时默认 `true`。 */
  forcePathStyle?: boolean;
  /** 对象公开访问的基础域名（末尾斜杠会被去除）；仅在未提供 `urlBuilder` 时生效。 */
  publicBaseUrl?: string;
  /** 自定义 URL 规则（如走 API 代理 `/api/files/:key`），优先级高于 publicBaseUrl。 */
  urlBuilder?: (key: string) => string;
  /** 上传时默认的 Cache-Control；仅 S3 后端生效。 */
  cacheControl?: string;
  /** driver=local 时使用；仅需提供根目录，bucket 由顶层 `bucket` 传入。 */
  local?: Pick<LocalStoreOptions, 'rootDir'>;
}

/**
 * 底层存储接口：门面 `ObjectStorage` 只依赖该接口，新增后端无需改动调用方。
 *
 * 实现方只关心对象级操作，不感知 URL 规则、图片处理等业务语义；
 * 门面负责访问 URL 解析与统一结果封装。
 */
export interface StorageBackend {
  /** 桶名（local 后端为命名空间子目录名）。 */
  readonly bucket: string;
  /** 确保桶 / 目录存在；返回是否本次新建。 */
  ensureBucket(): Promise<boolean>;
  /** 后端是否可用；任何异常都视为不健康，不向外抛错。 */
  isHealthy(): Promise<boolean>;
  /** 上传对象（同 key 覆盖）；`options` 中 S3 后端支持 `cacheControl`，本地后端忽略。 */
  put(key: string, body: Uint8Array, contentType: string, options?: PutOptions): Promise<void>;
  /** 读取对象；不存在返回 null，其它错误继续抛出。 */
  get(key: string): Promise<StoredObject | null>;
  /** 读取对象元信息；不存在返回 null，其它错误继续抛出。 */
  head(key: string): Promise<ObjectInfo | null>;
  /** 删除对象，幂等：对象不存在视为成功。 */
  delete(key: string): Promise<void>;
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
