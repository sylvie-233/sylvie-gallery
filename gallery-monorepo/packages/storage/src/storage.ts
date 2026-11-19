/**
 * S3 / RustFS 对象存储实现。
 *
 * 本文件只负责对象级操作：建桶探测、上传、读取、元信息探测与删除；
 * 图片压缩、水印、转码等处理不属于本包职责。
 * 配置全部通过构造参数注入，内部不读取环境变量，便于多服务复用与测试。
 */
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type {
  ObjectInfo,
  PutOptions,
  PutResult,
  StorageOptions,
  StoredObject,
} from './types.js';

/** 上传对象未指定 Cache-Control 时使用的默认值（一年、不可变）。 */
const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * 判断 S3 错误是否为「对象不存在」。
 *
 * GetObject / HeadObject 对缺失对象返回的错误名不同（NoSuchKey / NotFound），
 * 统一识别后由调用方转换为 null 语义。
 */
function isMissingObject(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NoSuchKey' || name === 'NotFound';
}

/** 去掉末尾斜杠，保证 `publicBaseUrl` 拼接时不会出现双斜杠。 */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * S3 / RustFS 对象存储客户端。
 *
 * - 配置由调用方注入，包内不读取环境变量；
 * - 不包含图片处理逻辑，只负责对象的上传、读取、探测与删除；
 * - 资源 URL 可通过 `publicBaseUrl` 或 `urlBuilder` 定制，后者优先；
 * - 除「不存在」按 null / 空操作处理外，其余存储错误直接抛出，由调用方决定降级策略。
 */
export class ObjectStorage {
  /** 桶名。 */
  readonly bucket: string;
  /** 底层 S3 客户端，供预签名 URL 等特殊场景直接使用。 */
  readonly client: S3Client;

  private readonly publicBaseUrl?: string;
  private readonly urlBuilder?: (key: string) => string;
  private readonly cacheControl: string;

  /**
   * 创建实例。
   *
   * 仅做参数校验与客户端装配，不发起网络请求；`endpoint` / `bucket` 为空时立即抛错。
   * `publicBaseUrl` 会去除末尾斜杠；`forcePathStyle` 默认开启以兼容 RustFS / MinIO；
   * `accessKeyId` / `secretAccessKey` 直接作为静态凭证使用。
   *
   * @throws endpoint 或 bucket 为空。
   */
  constructor(options: StorageOptions) {
    if (!options.endpoint.trim()) {
      throw new Error('ObjectStorage: endpoint 不能为空');
    }
    if (!options.bucket.trim()) {
      throw new Error('ObjectStorage: bucket 不能为空');
    }

    this.bucket = options.bucket;
    this.publicBaseUrl = options.publicBaseUrl?.trim()
      ? trimTrailingSlash(options.publicBaseUrl.trim())
      : undefined;
    this.urlBuilder = options.urlBuilder;
    this.cacheControl = options.cacheControl ?? DEFAULT_CACHE_CONTROL;

    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      forcePathStyle: options.forcePathStyle ?? true,
    });
  }

  /**
   * 启动时确保桶存在：先 HEAD 探测，不存在再创建。
   *
   * 桶已存在（或并发创建时抛出 `BucketAlreadyOwnedByYou` / `BucketAlreadyExists`）返回 false；
   * 其它错误（如连接失败、权限不足）继续抛出，由调用方决定是否阻断启动。
   *
   * @returns 是否本次新建了桶。
   */
  async ensureBucket(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return false;
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        return true;
      } catch (error) {
        const name = (error as { name?: string } | null)?.name;
        if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') {
          return false;
        }
        throw error;
      }
    }
  }

  /** 桶是否可访问（HEAD 探测）；任何异常都视为不健康，不向外抛错。 */
  async isHealthy(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
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
   * `body` 为完整字节数组；`contentType` 原样写入对象元数据。
   * Cache-Control 取 `options.cacheControl`，未传时使用实例默认值。
   *
   * @returns 存储键、解析后的访问 URL、上传字节数与内容类型。
   */
  async put(
    key: string,
    body: Uint8Array,
    contentType: string,
    options: PutOptions = {},
  ): Promise<PutResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: options.cacheControl ?? this.cacheControl,
      }),
    );

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
   * `body` 在支持时转换为 Web Stream，否则回退为字节数组，便于直接作为 HTTP 响应体。
   * 本包不会对内容做任何转换或处理。
   */
  async get(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) {
        return null;
      }
      return {
        body:
          typeof result.Body.transformToWebStream === 'function'
            ? result.Body.transformToWebStream()
            : await result.Body.transformToByteArray(),
        contentType: result.ContentType ?? 'application/octet-stream',
        contentLength: result.ContentLength,
      };
    } catch (error) {
      if (isMissingObject(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 读取对象元信息（HEAD，不下载内容）；对象不存在时返回 null，其它错误继续抛出。
   *
   * 字段缺失时对应值为 null（如部分实现不返回 ETag）。
   */
  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        size: result.ContentLength ?? null,
        contentType: result.ContentType ?? null,
        lastModified: result.LastModified ?? null,
        etag: result.ETag ?? null,
      };
    } catch (error) {
      if (isMissingObject(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 对象字节数（基于 HEAD）。
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
   * 对象是否存在（基于 HEAD）。
   *
   * 注意：`head` 抛出的非「不存在」错误会继续向上传播，而不是返回 false。
   */
  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  /**
   * 删除对象，幂等：对象不存在时 S3 同样返回成功，无需先探测。
   *
   * 只删除单个键；批量前缀清理不属于本包职责。
   */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** 创建对象存储实例（`new ObjectStorage(options)` 的工厂封装）。 */
export function createStorage(options: StorageOptions): ObjectStorage {
  return new ObjectStorage(options);
}
