/**
 * 前台认证请求校验：验证码、注册、登录、资料更新与头像上传表单。
 * 这里的输入会同时用于运行时校验与 OpenAPI 请求体模型。
 */
import { z } from '@hono/zod-openapi';

// 全站邮箱上限 128 字符，去空格后校验格式。
export const emailSchema = z.string().trim().email('邮箱格式不正确').max(128);

export const sendCodeSchema = z.object({
  email: emailSchema,
  // scene 决定验证码用途：注册或找回密码，默认注册。
  scene: z.enum(['register', 'reset_password']).default('register'),
});

export const registerSchema = z.object({
  nickname: z.string().trim().min(1, '昵称不能为空').max(16, '昵称最多 16 个字符'),
  email: emailSchema,
  // 密码为明文传输（须走 HTTPS），服务端加盐哈希后入库。
  password: z.string().min(6, '密码至少 6 位').max(64, '密码最多 64 位'),
  // 开发环境为固定 123456，生产为 6 位邮件验证码，这里放宽到 4-8 位。
  code: z.string().trim().min(4, '验证码格式不正确').max(8, '验证码格式不正确'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '请输入密码').max(64),
});

export const profileSchema = z.object({
  nickname: z.string().trim().min(1, '昵称不能为空').max(16, '昵称最多 16 个字符').optional(),
  // 0=预设色卡头像，1=自定义上传头像。
  avatarType: z.coerce.number().int().min(0).max(1).optional(),
  // 预设色卡下可选 0-7 号头像。
  avatarIndex: z.coerce.number().int().min(0).max(7).optional(),
});

// 仅用于 OpenAPI 描述 multipart 表单；实际文件类型与大小由 controller 校验。
export const avatarBodySchema = z.object({
  file: z.any().openapi({ type: 'string', format: 'binary' }),
});

export type SendCodeInput = z.infer<typeof sendCodeSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
