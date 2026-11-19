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

const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** 判断 S3 错误是否为「对象不存在」。 */
function isMissingObject(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NoSuchKey' || name === 'NotFound';
}

/** 去掉末尾斜杠。 */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * S3 / RustFS 对象存储客户端。
 *
 * - 配置由调用方注入，包内不读取环境变量；
 * - 不包含图片处理逻辑，只负责对象的上传、读取、探测与删除；
 * - 资源 URL 可通过 `publicBaseUrl` 或 `urlBuilder` 定制。
 */
export class ObjectStorage {
  readonly bucket: string;
  readonly client: S3Client;

  private readonly publicBaseUrl?: string;
  private readonly urlBuilder?: (key: string) => string;
  private readonly cacheControl: string;

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
   * 启动时确保桶存在。
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

  /** 桶是否可访问。 */
  async isHealthy(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  /** 解析对象的访问 URL。 */
  resolveUrl(key: string): string {
    if (this.urlBuilder) {
      return this.urlBuilder(key);
    }
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key}`;
    }
    return key;
  }

  /** 上传对象。 */
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

  /** 读取对象；不存在时返回 null。 */
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

  /** 读取对象元信息；不存在时返回 null。 */
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

  /** 对象字节数；不存在或探测失败时返回 null。 */
  async size(key: string): Promise<number | null> {
    try {
      const info = await this.head(key);
      return info?.size ?? null;
    } catch {
      return null;
    }
  }

  /** 对象是否存在。 */
  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  /** 删除对象；对象不存在时视为成功。 */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** 创建对象存储实例。 */
export function createStorage(options: StorageOptions): ObjectStorage {
  return new ObjectStorage(options);
}
