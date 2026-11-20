/**
 * 对象存储门面（ObjectStorage）。
 *
 * 只依赖 `StorageBackend` 接口，按 `createStorage` 的 `driver` 选择
 * S3 / RustFS（`S3Store`）或本地文件（`LocalStore`）；业务代码统一使用本门面，
 * 切换后端不需要改动调用方。图片压缩、水印、转码等处理不属于本包职责。
 */
import type { S3Client } from '@aws-sdk/client-s3';

import { LocalStore } from './local-store.js';
import { S3Store } from './s3-store.js';
import type {
  ObjectInfo,
  PutOptions,
  PutResult,
  StorageBackend,
  StorageOptions,
  StoredObject,
} from './types.js';

/** 去掉末尾斜杠，保证 `publicBaseUrl` 拼接时不会出现双斜杠。 */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * 统一对象存储门面。
 *
 * - 配置由调用方注入，包内不读取环境变量；
 * - 只负责对象的上传、读取、探测与删除，不包含图片处理逻辑；
 * - 资源 URL 可通过 `publicBaseUrl` 或 `urlBuilder` 定制，后者优先；
 * - 除「不存在」按 null / 空操作处理外，其余存储错误直接抛出，由调用方决定降级策略。
 */
export class ObjectStorage {
  /** 桶名（local 后端为命名空间子目录名）。 */
  readonly bucket: string;
  /** 底层 S3 客户端；仅 S3 后端可用，本地文件后端为 undefined。 */
  readonly client?: S3Client;

  private readonly backend: StorageBackend;
  private readonly publicBaseUrl?: string;
  private readonly urlBuilder?: (key: string) => string;

  /**
   * 创建门面实例。
   *
   * 一般不直接调用，优先使用 `createStorage(options)`；需要自定义后端时可传入
   * `StorageBackend` 实现。`publicBaseUrl` 会去除末尾斜杠，`urlBuilder` 优先级更高。
   */
  constructor(
    backend: StorageBackend,
    options: Pick<StorageOptions, 'publicBaseUrl' | 'urlBuilder'> = {},
  ) {
    this.backend = backend;
    this.bucket = backend.bucket;
    this.publicBaseUrl = options.publicBaseUrl?.trim()
      ? trimTrailingSlash(options.publicBaseUrl.trim())
      : undefined;
    this.urlBuilder = options.urlBuilder;

    if (backend instanceof S3Store) {
      this.client = backend.client;
    }
  }

  /** 启动时确保桶 / 目录存在（委托后端实现）；返回是否本次新建。 */
  ensureBucket(): Promise<boolean> {
    return this.backend.ensureBucket();
  }

  /** 后端是否可访问（委托后端实现）；任何异常都视为不健康，不向外抛错。 */
  isHealthy(): Promise<boolean> {
    return this.backend.isHealthy();
  }

  /**
   * 解析对象的访问 URL，规则按优先级：
   * 1. 配置了 `urlBuilder` 时直接使用其返回值（如 `/api/files/:key` 走 API 代理）；
   * 2. 否则配置了 `publicBaseUrl` 时拼接 `${publicBaseUrl}/${key}`；
   * 3. 两者都没有时原样返回 key（由调用方自行拼装）。
   *
   * 本方法只做字符串拼接，不校验对象是否存在。
   */
  resolveUrl(key: string): string {
    if (this.urlBuilder) {
      return this.urlBuilder(key);
    }
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key}`;
    }
    return key;
  }

  /**
   * 上传对象（同 key 会覆盖已有对象）。
   *
   * `body` 为完整字节数组；`contentType` 写入对象元数据（本地后端记入进程内映射）。
   * Cache-Control 取 `options.cacheControl`，未传时使用后端默认值（仅 S3 生效）。
   *
   * @returns 存储键、解析后的访问 URL、上传字节数与内容类型。
   */
  async put(
    key: string,
    body: Uint8Array,
    contentType: string,
    options: PutOptions = {},
  ): Promise<PutResult> {
    await this.backend.put(key, body, contentType, options);
    return {
      key,
      url: this.resolveUrl(key),
      size: body.byteLength,
      contentType,
    };
  }

  /**
   * 读取对象内容与元信息；对象不存在时返回 null，其它错误继续抛出。
   *
   * `body` 在支持时转换为 Web Stream，否则为字节数组，便于直接作为 HTTP 响应体。
   * 本包不会对内容做任何转换或处理。
   */
  get(key: string): Promise<StoredObject | null> {
    return this.backend.get(key);
  }

  /**
   * 读取对象元信息（不下载内容）；对象不存在时返回 null，其它错误继续抛出。
   *
   * 字段缺失时对应值为 null（如部分实现不返回 ETag）。
   */
  head(key: string): Promise<ObjectInfo | null> {
    return this.backend.head(key);
  }

  /**
   * 对象字节数（基于 `head`）。
   *
   * 与 `head` 不同，这里吞掉所有异常：对象不存在或探测失败都返回 null，
   * 适合「能算就算、算不出就跳过」的估算场景（如压缩包大小预估）。
   */
  async size(key: string): Promise<number | null> {
    try {
      const info = await this.head(key);
      return info?.size ?? null;
    } catch {
      return null;
    }
  }

  /**
   * 对象是否存在（基于 `head`）。
   *
   * 注意：`head` 抛出的非「不存在」错误会继续向上传播，而不是返回 false。
   */
  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  /** 删除对象，幂等：对象不存在视为成功；不包含批量前缀清理。 */
  delete(key: string): Promise<void> {
    return this.backend.delete(key);
  }
}

/**
 * 按配置创建对象存储门面。
 *
 * `driver` 缺省为 `s3`（保持既有 RustFS / S3 调用方无需改动）；
 * `driver=local` 时使用 `LocalStore`，以 `local.rootDir` 为文件根目录、
 * 顶层 `bucket` 为命名空间子目录。`publicBaseUrl` / `urlBuilder` 透传给门面。
 */
export function createStorage(options: StorageOptions): ObjectStorage {
  let backend: StorageBackend;

  if (options.driver === 'local') {
    backend = new LocalStore({
      rootDir: options.local?.rootDir ?? '',
      bucket: options.bucket,
    });
  } else {
    backend = new S3Store({
      endpoint: options.endpoint ?? '',
      region: options.region ?? 'us-east-1',
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      bucket: options.bucket,
      forcePathStyle: options.forcePathStyle,
      cacheControl: options.cacheControl,
    });
  }

  return new ObjectStorage(backend, {
    publicBaseUrl: options.publicBaseUrl,
    urlBuilder: options.urlBuilder,
  });
}
