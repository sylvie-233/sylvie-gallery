import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { env } from '../config/env.js';

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

/** 启动时确保桶存在（RustFS 首次运行没有默认桶）。 */
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    return;
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
      console.log(`[api] 已创建对象存储桶：${env.S3_BUCKET}`);
    } catch (error) {
      const code = (error as { name?: string }).name;
      if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') {
        throw error;
      }
    }
  }
}

export async function storageHealthy(): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    return true;
  } catch {
    return false;
  }
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

/** 上传对象；返回值优先使用配置的公开域名，否则走 API 代理地址。 */
export async function uploadObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<UploadResult> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const url = env.S3_PUBLIC_URL
    ? `${env.S3_PUBLIC_URL.replace(/\/+$/, '')}/${key}`
    : `/api/files/${key}`;

  return { key, url, size: body.byteLength, contentType };
}

export interface StoredObject {
  body: ReadableStream | Uint8Array;
  contentType: string;
  contentLength: number | undefined;
}

/** 读取对象用于 API 代理；不存在时返回 null。 */
export async function getObject(key: string): Promise<StoredObject | null> {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
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
    const name = (error as { name?: string }).name;
    if (name === 'NoSuchKey' || name === 'NotFound') {
      return null;
    }
    throw error;
  }
}
