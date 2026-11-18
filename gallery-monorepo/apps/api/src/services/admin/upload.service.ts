import { randomUUID } from 'node:crypto';

import sharp from 'sharp';

import type { AdminUploadResult } from '@sylvie/types';

import { HttpError } from '../../utils/http.js';
import { uploadObject } from '../storage.service.js';

export type AdminUploadKind = 'image' | 'video' | 'avatar';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const VIDEO_MAX_BYTES = 500 * 1024 * 1024;

function watermarkSvg(width: number, height: number): string {
  const fontSize = Math.max(28, Math.round(width / 16));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <g transform="rotate(-28 ${width / 2} ${height / 2})" fill="rgba(255,255,255,0.36)"
       font-family="PingFang SC, Microsoft YaHei, sans-serif" font-weight="700"
       font-size="${fontSize}">
      <text x="${width * 0.06}" y="${height * 0.34}">希尔薇图集</text>
      <text x="${width * 0.28}" y="${height * 0.56}">希尔薇图集</text>
      <text x="${width * 0.5}" y="${height * 0.78}">希尔薇图集</text>
    </g>
  </svg>`;
}

async function uploadImage(
  buffer: Buffer,
  kind: 'image' | 'avatar',
  adminId: number,
): Promise<AdminUploadResult> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new HttpError(400, '图片文件无法解析');
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new HttpError(400, '图片尺寸无效');
  }

  const id = randomUUID();
  const date = new Date();
  const folder = kind === 'avatar' ? `avatars/admin-${adminId}` : 'albums/images';
  const originalKey = `${folder}/${date.getTime()}-${id}.jpg`;

  const original = await sharp(buffer).jpeg({ quality: 88 }).toBuffer();
  if (kind === 'avatar') {
    const avatar = await sharp(buffer)
      .resize(256, 256, { fit: 'cover' })
      .jpeg({ quality: 88 })
      .toBuffer();
    const key = `${folder}/${date.getTime()}-${id}.jpg`;
    const uploaded = await uploadObject(key, avatar, 'image/jpeg');
    return {
      url: uploaded.url,
      key,
      mediaType: 'image',
      size: avatar.byteLength,
      contentType: 'image/jpeg',
      filename: 'avatar.jpg',
      thumbUrl: uploaded.url,
      watermarkUrl: null,
      width: 256,
      height: 256,
    };
  }

  const thumb = await sharp(buffer)
    .resize(600, null, { withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const watermark = await sharp(buffer)
    .composite([{ input: Buffer.from(watermarkSvg(width, height)), blend: 'over' }])
    .jpeg({ quality: 82 })
    .toBuffer();

  const [originalUpload, thumbUpload, watermarkUpload] = await Promise.all([
    uploadObject(originalKey, original, 'image/jpeg'),
    uploadObject(
      `albums/thumbs/${date.getTime()}-${id}.jpg`,
      thumb,
      'image/jpeg',
    ),
    uploadObject(
      `albums/watermarks/${date.getTime()}-${id}.jpg`,
      watermark,
      'image/jpeg',
    ),
  ]);

  return {
    url: originalUpload.url,
    key: originalKey,
    mediaType: 'image',
    size: original.byteLength,
    contentType: 'image/jpeg',
    filename: `${id}.jpg`,
    thumbUrl: thumbUpload.url,
    watermarkUrl: watermarkUpload.url,
    width,
    height,
  };
}

export async function handleAdminUpload(
  file: File,
  kind: AdminUploadKind,
  adminId: number,
): Promise<AdminUploadResult> {
  if (kind === 'video') {
    const extension = VIDEO_TYPES[file.type];
    if (!extension) {
      throw new HttpError(400, '视频仅支持 mp4 / mov / webm');
    }
    if (file.size > VIDEO_MAX_BYTES) {
      throw new HttpError(400, '视频大小不能超过 500MB');
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `albums/videos/${Date.now()}-${randomUUID()}.${extension}`;
    const uploaded = await uploadObject(key, buffer, file.type);
    return {
      url: uploaded.url,
      key,
      mediaType: 'video',
      size: buffer.byteLength,
      contentType: file.type,
      filename: file.name || `video.${extension}`,
      thumbUrl: null,
      watermarkUrl: null,
      width: null,
      height: null,
    };
  }

  const extension = IMAGE_TYPES[file.type];
  if (!extension) {
    throw new HttpError(400, '图片仅支持 jpg / png / webp');
  }
  const limit = kind === 'avatar' ? AVATAR_MAX_BYTES : IMAGE_MAX_BYTES;
  if (file.size > limit) {
    throw new HttpError(400, kind === 'avatar' ? '头像不能超过 5MB' : '图片不能超过 20MB');
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadImage(buffer, kind === 'avatar' ? 'avatar' : 'image', adminId);
  return { ...result, filename: file.name || result.filename };
}
