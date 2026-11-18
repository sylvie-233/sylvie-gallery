import { Hono } from 'hono';
import { z } from 'zod';

import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { login } from '../../services/auth.service.js';
import { getProfileById } from '../../services/user.service.js';
import type { AppEnv } from '../../types/context.js';
import { HttpError, success } from '../../utils/http.js';
import { parseJson } from '../../utils/validate.js';

const router = new Hono<AppEnv>();

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, '请输入账号')
    .max(128)
    .refine(
      (value) =>
        value.toLowerCase() === 'admin' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      '账号格式不正确',
    ),
  password: z.string().min(1, '请输入密码').max(64),
});

router.post('/login', async (c) => {
  const input = await parseJson(c, loginSchema);
  // 演示后台允许使用简写 admin 登录；正式账号仍为邮箱
  const email = input.email.includes('@')
    ? input.email
    : input.email.trim().toLowerCase() === 'admin'
      ? 'admin@sylvie.cc'
      : input.email;
  const result = await login(email, input.password);
  if (result.profile.role !== 'admin') {
    throw new HttpError(403, '该账号没有管理后台权限');
  }
  return success(c, result, '登录成功');
});

router.get('/me', authenticate, requireAdmin, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  return success(c, await getProfileById(user.id));
});

export default router;
