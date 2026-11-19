/**
 * 后台登录参数校验：账号可填演示简写 admin 或标准邮箱，密码 1-64 位。
 */
import { z } from '@hono/zod-openapi';

/** 账号最长 128，允许简写 admin 或邮箱格式；密码不在此处校验强度。 */
export const adminLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, '请输入账号')
    .max(128)
    .refine(
      (value) => value.toLowerCase() === 'admin' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      '账号格式不正确',
    ),
  password: z.string().min(1, '请输入密码').max(64),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
