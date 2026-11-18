import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import { z } from 'zod';

import { MAX_AVATAR_BYTES } from '@sylvie/types';

import { authenticate } from '../middleware/auth.js';
import { login, register, sendVerifyCode } from '../services/auth.service.js';
import { uploadObject } from '../services/storage.service.js';
import {
  checkin,
  getCheckinStatus,
  getProfileById,
  setAvatarUrl,
  updateProfile,
} from '../services/user.service.js';
import type { AppEnv } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { parseJson } from '../utils/validate.js';
import { success } from '../utils/http.js';

const router = new Hono<AppEnv>();

const emailSchema = z.string().trim().email('邮箱格式不正确').max(128);

const sendCodeSchema = z.object({
  email: emailSchema,
  scene: z.enum(['register', 'reset_password']).default('register'),
});

router.post('/send-code', async (c) => {
  const input = await parseJson(c, sendCodeSchema);
  const result = await sendVerifyCode(input.email, input.scene);
  return success(c, result, '验证码已发送');
});

const registerSchema = z.object({
  nickname: z.string().trim().min(1, '昵称不能为空').max(16, '昵称最多 16 个字符'),
  email: emailSchema,
  password: z.string().min(6, '密码至少 6 位').max(64, '密码最多 64 位'),
  code: z.string().trim().min(4, '验证码格式不正确').max(8, '验证码格式不正确'),
});

router.post('/register', async (c) => {
  const input = await parseJson(c, registerSchema);
  const result = await register(input);
  return success(c, result, '注册成功', 201);
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '请输入密码').max(64),
});

router.post('/login', async (c) => {
  const input = await parseJson(c, loginSchema);
  const result = await login(input.email, input.password);
  return success(c, result, '登录成功');
});

router.get('/me', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  return success(c, await getProfileById(user.id));
});

const profileSchema = z.object({
  nickname: z.string().trim().min(1, '昵称不能为空').max(16, '昵称最多 16 个字符').optional(),
  avatarType: z.coerce.number().int().min(0).max(1).optional(),
  avatarIndex: z.coerce.number().int().min(0).max(7).optional(),
});

router.patch('/profile', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const input = await parseJson(c, profileSchema);
  return success(c, await updateProfile(user.id, input), '资料已更新');
});

const ALLOWED_AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

router.post('/avatar', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }

  const body = await c.req.parseBody();
  const file = body['file'];
  if (!(file instanceof File)) {
    throw new HttpError(400, '请选择要上传的头像文件');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new HttpError(400, '头像大小不能超过 2MB');
  }
  const extension = ALLOWED_AVATAR_TYPES[file.type];
  if (!extension) {
    throw new HttpError(400, '仅支持 jpg / png / webp 格式');
  }

  const key = `avatars/${user.id}/${Date.now()}-${randomUUID()}.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploaded = await uploadObject(key, bytes, file.type);
  const profile = await setAvatarUrl(user.id, uploaded.url);
  return success(c, profile, '头像已更新');
});

router.get('/checkin', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  return success(c, await getCheckinStatus(user.id));
});

router.post('/checkin', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const result = await checkin(user.id);
  return success(c, result, result.message);
});

export default router;
