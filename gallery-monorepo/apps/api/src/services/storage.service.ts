import { createStorage, type PutResult, type StoredObject } from '@sylvie/storage';

import { env } from '../config/env.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('storage');

/** 应用级对象存储实例：配置来自环境变量，URL 优先公开域名，否则走 API 代理。 */
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

/** 启动时确保桶存在（RustFS 首次运行没有默认桶）。 */
export async function ensureBucket(): Promise<void> {
  const created = await storage.ensureBucket();
  if (created) {
    log.info('已创建对象存储桶', { bucket: env.S3_BUCKET });
  }
}

/** 桶是否可访问。 */
export function storageHealthy(): Promise<boolean> {
  return storage.isHealthy();
}

export type UploadResult = PutResult;
export type StoredObjectResult = StoredObject;

/** 上传对象。 */
export function uploadObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<UploadResult> {
  return storage.put(key, body, contentType);
}

/** 读取对象字节数，用于估算图集压缩包大小；失败返回 null。 */
export function getObjectSize(key: string): Promise<number | null> {
  return storage.size(key);
}

/** 读取对象用于 API 代理；不存在时返回 null。 */
export function getObject(key: string): Promise<StoredObjectResult | null> {
  return storage.get(key);
}
