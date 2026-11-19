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

/** GET /api/admin/config */
export async function bundle(c: AppContext): Promise<Response> {
  return success(c, await getAdminConfigBundle());
}

/** PUT /api/admin/config/site */
export async function updateSite(c: AppContext, input: SiteConfigInput): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await updateAdminSiteConfig(operator.adminId, input, operator.ip),
    '站点配置已保存',
  );
}

/** PUT /api/admin/config/plan */
export async function updatePlan(c: AppContext, input: PlanConfigInput): Promise<Response> {
  const operator = adminOperator(c);
  return success(c, await updateAdminPlan(operator.adminId, input, operator.ip), '会员套餐已保存');
}

/** POST /api/admin/config/friends */
export async function createFriend(c: AppContext, input: FriendLinkInput): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await createAdminFriendLink(operator.adminId, input, operator.ip),
    '友链已添加',
    201,
  );
}

/** DELETE /api/admin/config/friends/:id */
export async function deleteFriend(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAdminFriendLink(operator.adminId, id, operator.ip);
  return success(c, null, '友链已删除');
}
