import { scheduleVipExpiryNotice } from '../../jobs/index.js';
import {
  adjustAdminUserPoints,
  getAdminUsers,
  grantAdminUserVip,
  resetAdminUserPassword,
  toggleAdminUserStatus,
} from '../../services/admin/user-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { PointsInput, UserListInput } from '../../validators/admin/commerce.js';
import { adminOperator } from './helpers.js';

/** GET /api/admin/users */
export async function list(c: AppContext, query: UserListInput): Promise<Response> {
  return success(c, await getAdminUsers(query));
}

/** POST /api/admin/users/:id/points */
export async function adjustPoints(
  c: AppContext,
  id: number,
  input: PointsInput,
): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await adjustAdminUserPoints(operator.adminId, id, input, operator.ip),
    '积分已调整',
  );
}

/** POST /api/admin/users/:id/grant-vip */
export async function grantVip(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  const result = await grantAdminUserVip(operator.adminId, id, operator.ip);
  await scheduleVipExpiryNotice(id);
  return success(c, result, '已赠送 30 天付费会员');
}

/** POST /api/admin/users/:id/reset-password */
export async function resetPassword(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await resetAdminUserPassword(operator.adminId, id, operator.ip),
    '密码已重置',
  );
}

/** POST /api/admin/users/:id/toggle-status */
export async function toggleStatus(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  const result = await toggleAdminUserStatus(operator.adminId, id, operator.ip);
  return success(c, result, result.status === 1 ? '用户已解封' : '用户已封禁');
}
