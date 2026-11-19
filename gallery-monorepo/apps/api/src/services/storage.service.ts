/**
 * 应用级对象存储服务（RustFS / S3）：
 * 统一注入环境配置，负责建桶、健康检查与对象上传 / 读取 / 探测 / 删除。
 * 图片压缩、水印等业务处理仍留在 API，本文件只做存储访问。
 */
import { createStorage, type PutResult, type StoredObject } from '@sylvie/storage';

import { env } from '../config/env.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('storage');

/**
 * 应用级对象存储实例：配置来自环境变量，URL 规则为：
 * - 配置 `S3_PUBLIC_URL` 时，资源 URL 为 `${S3_PUBLIC_URL}/${key}`（对象需公开可读或由 CDN 回源）；
 * - 未配置时，通过 `urlBuilder` 生成 `/api/files/${key}`，由 API 代理读取，按鉴权规则返回。
 */
export const storage = createStorage({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
  bucket: env.S3_BUCKET,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  publicBaseUrl: env.S3_PUBLIC_URL || undefined,
  urlBuilder: env.S3_PUBLIC_URL ? undefined : (key) => `/api/files/${key}`,
});

/**
 * 启动时确保桶存在（RustFS 首次运行没有默认桶）。
 * 已存在时直接返回；新建成功时记录日志。连接失败会抛错，由调用方决定是否阻断启动。
 */
export async function ensureBucket(): Promise<void> {
  const created = await storage.ensureBucket();
  if (created) {
    log.info('已创建对象存储桶', { bucket: env.S3_BUCKET });
  }
}

/** 桶是否可访问（HeadBucket 探测），供健康检查使用；不抛错。 */
export function storageHealthy(): Promise<boolean> {
  return storage.isHealthy();
}

/** 上传结果：包含 key、按上述规则解析出的 URL、字节数与内容类型。 */
export type UploadResult = PutResult;
/** 读取到的对象：body 为 Web Stream 或字节数组，另含内容类型与长度。 */
export type StoredObjectResult = StoredObject;

/**
 * 上传对象；相同 key 会覆盖已有对象。
 * @param key 对象键（含目录前缀，如 `albums/1/cover.jpg`）。
 * @param body 文件字节。
 * @param contentType MIME 类型。
 * @returns 存储键、访问 URL、大小与内容类型。
 */
export function uploadObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<UploadResult> {
  return storage.put(key, body, contentType);
}

/** 读取对象字节数（HEAD 探测），用于估算图集压缩包大小；对象不存在或探测失败返回 null。 */
export function getObjectSize(key: string): Promise<number | null> {
  return storage.size(key);
}

/** 读取对象内容与元信息，用于 `/api/files/:key` 代理；对象不存在时返回 null。 */
export function getObject(key: string): Promise<StoredObjectResult | null> {
  return storage.get(key);
}
