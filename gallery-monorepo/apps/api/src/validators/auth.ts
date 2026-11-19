import { z } from '@hono/zod-openapi';

export const emailSchema = z.string().trim().email('邮箱格式不正确').max(128);

export const sendCodeSchema = z.object({
  email: emailSchema,
  scene: z.enum(['register', 'reset_password']).default('register'),
});

export const registerSchema = z.object({
  nickname: z.string().trim().min(1, '昵称不能为空').max(16, '昵称最多 16 个字符'),
  email: emailSchema,
  password: z.string().min(6, '密码至少 6 位').max(64, '密码最多 64 位'),
  code: z.string().trim().min(4, '验证码格式不正确').max(8, '验证码格式不正确'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '请输入密码').max(64),
});

export const profileSchema = z.object({
  nickname: z.string().trim().min(1, '昵称不能为空').max(16, '昵称最多 16 个字符').optional(),
  avatarType: z.coerce.number().int().min(0).max(1).optional(),
  avatarIndex: z.coerce.number().int().min(0).max(7).optional(),
});

export const avatarBodySchema = z.object({
  file: z.any().openapi({ type: 'string', format: 'binary' }),
});

export type SendCodeInput = z.infer<typeof sendCodeSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
