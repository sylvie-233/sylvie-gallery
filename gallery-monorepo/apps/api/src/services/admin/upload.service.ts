/**
 * 后台上传：图片（原图 / 缩略图 / 水印图）、头像与视频，统一写入对象存储。
 *
 * 图片经 Sharp 统一转为 JPEG 并生成 600px 缩略图与带「希尔薇图集」水印的预览图；
 * 水印图仅用于未解锁预览，解锁后返回原图。
 */
import { randomUUID } from 'node:crypto';

import sharp from 'sharp';

import type { AdminUploadResult } from '@sylvie/types';

import { HttpError } from '../../utils/http.js';
import { uploadObject } from '../storage.service.js';

/** 上传类型：普通图片（生成三份）、视频、管理员头像（裁剪为 256×256）。 */
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

/** 生成覆盖整张图片的斜向水印 SVG，字号随宽度缩放，三行平铺。 */
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

/**
 * 处理并上传图片。
 *
 * 读取元数据校验尺寸；原图转 JPEG（质量 88）。
 * - avatar：裁剪为 256×256，只上传一份；
 * - image：额外生成 600px 缩略图与整图水印图，三份并发上传。
 * 对象键包含时间戳与 UUID，避免覆盖。图片无法解析或尺寸无效时抛 400。
 */
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

/**
 * 后台统一上传入口。
 *
 * 按 kind 校验 MIME 白名单与大小上限：图片 jpg/png/webp ≤ 20MB、头像 ≤ 5MB、
 * 视频 mp4/mov/webm ≤ 500MB；图片 / 头像交给 uploadImage 统一转码，
 * 视频按原格式上传且不生成缩略图 / 水印。
 * 返回原始 URL、对象键及媒体元数据，供图集保存时引用。
 */
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
