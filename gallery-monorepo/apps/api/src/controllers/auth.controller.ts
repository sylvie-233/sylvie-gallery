/**
 * 前台认证控制器：验证码、注册 / 登录、个人资料、头像上传与每日签到。
 * 所有输入都已在路由层通过 zod 校验，本层负责调用服务、存储头像并包装响应。
 */
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

// 头像 MIME 白名单；值同时作为对象存储的扩展名，避免信任用户上传的文件名。
const ALLOWED_AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * POST /api/auth/send-code —— 发送邮箱验证码。
 *
 * @param input 路由校验后的 sendCodeSchema（邮箱与 scene）
 * 副作用：生成 6 位验证码并发送邮件；开发环境在响应中回传 demoCode。
 */
export async function sendCode(c: AppContext, input: SendCodeInput) {
  return success(c, await sendVerifyCode(input.email, input.scene), '验证码已发送');
}

/**
 * POST /api/auth/register —— 注册会员账号。
 *
 * @param input 路由校验后的 registerSchema（昵称、邮箱、密码、验证码）
 * 副作用：创建用户、消费验证码，并直接签发 JWT（201）。
 */
export async function registerUser(c: AppContext, input: RegisterInput) {
  return success(c, await register(input), '注册成功', 201);
}

/**
 * POST /api/auth/login —— 邮箱密码登录。
 *
 * @param input 路由校验后的 loginSchema
 * 成功时签发 JWT 并返回用户资料，不写 Cookie，登录态由前端存 localStorage。
 */
export async function loginUser(c: AppContext, input: LoginInput) {
  return success(c, await login(input.email, input.password), '登录成功');
}

/** GET /api/auth/me —— 当前用户资料（身份来自 authenticate 中间件）。 */
export async function me(c: AppContext) {
  return success(c, await getProfileById(requireUser(c).id));
}

/**
 * PATCH /api/auth/profile —— 更新昵称与预设头像。
 *
 * @param input 路由校验后的 profileSchema（可选昵称、avatarType、avatarIndex）
 * 只更新当前用户自己的资料。
 */
export async function updateMyProfile(c: AppContext, input: ProfileInput) {
  return success(c, await updateProfile(requireUser(c).id, input), '资料已更新');
}

/**
 * POST /api/auth/avatar —— 上传自定义头像。
 *
 * 从 multipart 表单的 file 字段读取文件，校验类型（jpg/png/webp）与大小（≤2MB）；
 * 对象键为 avatars/{userId}/{时间戳}-{UUID}.{扩展名}，上传后把 URL 写回用户资料。
 */
export async function uploadAvatar(c: AppContext) {
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

/** GET /api/auth/checkin —— 今日签到状态（checkedIn、dailyPoints），只读。 */
export async function checkinStatus(c: AppContext) {
  return success(c, await getCheckinStatus(requireUser(c).id));
}

/**
 * POST /api/auth/checkin —— 每日签到。
 *
 * 副作用：当日首次签到时按 sys_config.checkin.points 加分（默认 2）；
 * 重复签到由服务层幂等处理，message 为可直接展示的提示文案。
 */
export async function checkinToday(c: AppContext) {
  const result = await checkin(requireUser(c).id);
  return success(c, result, result.message);
}
