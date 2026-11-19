/**
 * 后台用户控制器：列表、积分调整、赠送会员、重置密码与封禁/解封。
 * 写操作记录管理日志；赠送会员会登记到期通知任务。
 */
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

/** GET /api/admin/users —— 参数来自 query，按角色、状态与关键词分页查询。 */
export async function list(c: AppContext, query: UserListInput): Promise<Response> {
  return success(c, await getAdminUsers(query));
}

/** POST /api/admin/users/:id/points —— 按 delta 增减积分；service 保证 user.points 不为负。 */
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

/** POST /api/admin/users/:id/grant-vip —— 赠送 30 天会员，并在现有到期时间上叠加。 */
export async function grantVip(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  const result = await grantAdminUserVip(operator.adminId, id, operator.ip);
  // 会员到期依赖延时任务提醒；赠送后重新登记，避免沿用旧到期时间。
  await scheduleVipExpiryNotice(id);
  return success(c, result, '已赠送 30 天付费会员');
}

/** POST /api/admin/users/:id/reset-password —— 重置为系统默认密码，操作写入管理日志。 */
export async function resetPassword(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await resetAdminUserPassword(operator.adminId, id, operator.ip),
    '密码已重置',
  );
}

/** POST /api/admin/users/:id/toggle-status —— 在封禁（status=0）/解封（status=1）之间切换。 */
export async function toggleStatus(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  const result = await toggleAdminUserStatus(operator.adminId, id, operator.ip);
  return success(c, result, result.status === 1 ? '用户已解封' : '用户已封禁');
}
