/**
 * 后台配置控制器：站点配置、会员套餐与友情链接的读取与保存。
 * 写操作按影响范围失效站点或订单缓存，并写入管理操作日志。
 */
import { invalidateCache } from '../../cache/index.js';
import {
  createAdminFriendLink,
  deleteAdminFriendLink,
  getAdminConfigBundle,
  updateAdminPlan,
  updateAdminSiteConfig,
} from '../../services/admin/config-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type {
  FriendLinkInput,
  PlanConfigInput,
  SiteConfigInput,
} from '../../validators/admin/commerce.js';
import { adminOperator } from './helpers.js';

/** GET /api/admin/config —— 一次性返回站点配置、会员套餐与友情链接。 */
export async function bundle(c: AppContext): Promise<Response> {
  return success(c, await getAdminConfigBundle());
}

/** PUT /api/admin/config/site —— 保存站点配置；签到积分与水印开关影响前台站点聚合。 */
export async function updateSite(c: AppContext, input: SiteConfigInput): Promise<Response> {
  const operator = adminOperator(c);
  const result = await updateAdminSiteConfig(operator.adminId, input, operator.ip);
  await invalidateCache('site');
  return success(c, result, '站点配置已保存');
}

/** PUT /api/admin/config/plan —— 保存会员套餐；价格与权益同时影响订单页与站点数据。 */
export async function updatePlan(c: AppContext, input: PlanConfigInput): Promise<Response> {
  const operator = adminOperator(c);
  const result = await updateAdminPlan(operator.adminId, input, operator.ip);
  await invalidateCache('orders', 'site');
  return success(c, result, '会员套餐已保存');
}

/** POST /api/admin/config/friends —— 新增友情链接，入参来自校验后的 body。 */
export async function createFriend(c: AppContext, input: FriendLinkInput): Promise<Response> {
  const operator = adminOperator(c);
  const result = await createAdminFriendLink(operator.adminId, input, operator.ip);
  await invalidateCache('site');
  return success(c, result, '友链已添加', 201);
}

/** DELETE /api/admin/config/friends/:id —— 删除友情链接，仅失效站点缓存。 */
export async function deleteFriend(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAdminFriendLink(operator.adminId, id, operator.ip);
  await invalidateCache('site');
  return success(c, null, '友链已删除');
}
