import { login } from '../../services/auth.service.js';
import { getProfileById } from '../../services/user.service.js';
import type { AppContext } from '../../types/context.js';
import { HttpError, success } from '../../utils/http.js';
import type { AdminLoginInput } from '../../validators/admin/auth.js';
import { requireUser } from '../helpers.js';

/** POST /api/admin/auth/login */
export async function loginAdmin(c: AppContext, input: AdminLoginInput): Promise<Response> {
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
}

/** GET /api/admin/auth/me */
export async function me(c: AppContext): Promise<Response> {
  return success(c, await getProfileById(requireUser(c).id));
}
