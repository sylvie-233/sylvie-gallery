/**
 * S3 / RustFS 对象存储后端实现（S3Store）。
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
  S3StoreOptions,
  StorageBackend,
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

/**
 * S3 / RustFS 对象存储后端。
 *
 * - 配置由调用方注入，包内不读取环境变量；
 * - 不包含图片处理逻辑，只负责对象的上传、读取、探测与删除；
 * - 除「不存在」按 null / 空操作处理外，其余存储错误直接抛出，由调用方决定降级策略。
 */
export class S3Store implements StorageBackend {
  /** 桶名。 */
  readonly bucket: string;
  /** 底层 S3 客户端，通过门面的 `client` 暴露，供预签名 URL 等特殊场景直接使用。 */
  readonly client: S3Client;

  private readonly cacheControl: string;

  /**
   * 创建 S3 后端。
   *
   * 仅做参数校验与客户端装配，不发起网络请求；`endpoint` / `bucket` 为空时立即抛错。
   * `forcePathStyle` 默认开启以兼容 RustFS / MinIO；
   * 同时提供 `accessKeyId` 与 `secretAccessKey` 时作为静态凭证，否则交给 SDK 默认凭证链。
   *
   * @throws endpoint 或 bucket 为空。
   */
  constructor(options: S3StoreOptions) {
    if (!options.endpoint.trim()) {
      throw new Error('S3Store: endpoint 不能为空');
    }
    if (!options.bucket.trim()) {
      throw new Error('S3Store: bucket 不能为空');
    }

    this.bucket = options.bucket;
    this.cacheControl = options.cacheControl ?? DEFAULT_CACHE_CONTROL;

    const credentials =
      options.accessKeyId && options.secretAccessKey
        ? {
            accessKeyId: options.accessKeyId,
            secretAccessKey: options.secretAccessKey,
          }
        : undefined;

    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      ...(credentials ? { credentials } : {}),
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
   * 上传对象（同 key 会覆盖已有对象）。
   *
   * `body` 为完整字节数组；`contentType` 原样写入对象元数据。
   * Cache-Control 取 `options.cacheControl`，未传时使用实例默认值。
   */
  async put(
    key: string,
    body: Uint8Array,
    contentType: string,
    options: PutOptions = {},
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: options.cacheControl ?? this.cacheControl,
      }),
    );
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

  /** 删除对象，幂等：对象不存在时 S3 同样返回成功，无需先探测。 */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
