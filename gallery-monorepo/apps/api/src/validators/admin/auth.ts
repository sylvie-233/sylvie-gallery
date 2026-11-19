import { z } from '@hono/zod-openapi';

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
