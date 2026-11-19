import { randomUUID } from 'node:crypto';

import { MAX_AVATAR_BYTES } from '@sylvie/types';

import { login, register, sendVerifyCode } from '../services/auth.service.js';
import { uploadObject } from '../services/storage.service.js';
import {
  checkin,
  getCheckinStatus,
  getProfileById,
  setAvatarUrl,
  updateProfile,
} from '../services/user.service.js';
import type { AppContext } from '../types/context.js';
import { HttpError, success } from '../utils/http.js';
import type { LoginInput, ProfileInput, RegisterInput, SendCodeInput } from '../validators/auth.js';
import { requireUser } from './helpers.js';

const ALLOWED_AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** POST /api/auth/send-code */
export async function sendCode(c: AppContext, input: SendCodeInput): Promise<Response> {
  return success(c, await sendVerifyCode(input.email, input.scene), '验证码已发送');
}

/** POST /api/auth/register */
export async function registerUser(c: AppContext, input: RegisterInput): Promise<Response> {
  return success(c, await register(input), '注册成功', 201);
}

/** POST /api/auth/login */
export async function loginUser(c: AppContext, input: LoginInput): Promise<Response> {
  return success(c, await login(input.email, input.password), '登录成功');
}

/** GET /api/auth/me */
export async function me(c: AppContext): Promise<Response> {
  return success(c, await getProfileById(requireUser(c).id));
}

/** PATCH /api/auth/profile */
export async function updateMyProfile(c: AppContext, input: ProfileInput): Promise<Response> {
  return success(c, await updateProfile(requireUser(c).id, input), '资料已更新');
}

/** POST /api/auth/avatar */
export async function uploadAvatar(c: AppContext): Promise<Response> {
  const user = requireUser(c);
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
  return success(c, await setAvatarUrl(user.id, uploaded.url), '头像已更新');
}

/** GET /api/auth/checkin */
export async function checkinStatus(c: AppContext): Promise<Response> {
  return success(c, await getCheckinStatus(requireUser(c).id));
}

/** POST /api/auth/checkin */
export async function checkinToday(c: AppContext): Promise<Response> {
  const result = await checkin(requireUser(c).id);
  return success(c, result, result.message);
}
