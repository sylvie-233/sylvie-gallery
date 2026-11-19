/**
 * 后台标签控制器：列表、新建、重命名、显隐与删除。
 * 标签收录数变化会影响图集筛选与站点聚合，写操作后按需失效缓存。
 */
import { invalidateCache } from '../../cache/index.js';
import {
  createAdminTag,
  deleteAdminTag,
  getAdminTags,
  toggleAdminTag,
  updateAdminTag,
} from '../../services/admin/tag-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { TagListInput, TagNameInput } from '../../validators/admin/catalog.js';
import { adminOperator } from './helpers.js';

/** GET /api/admin/tags —— 参数来自 query，按状态与关键词分页查询标签。 */
export async function list(c: AppContext, query: TagListInput) {
  return success(c, await getAdminTags(query));
}

/** POST /api/admin/tags —— 入参为校验后的标签名，创建后失效标签与站点缓存。 */
export async function create(c: AppContext, input: TagNameInput) {
  const operator = adminOperator(c);
  const result = await createAdminTag(operator.adminId, input.name, operator.ip);
  await invalidateCache('tags', 'site');
  return success(c, result, '标签已创建', 201);
}

/** PUT /api/admin/tags/:id —— 重命名标签，图集侧展示同步变化，需连带失效图集缓存。 */
export async function update(c: AppContext, id: number, input: TagNameInput) {
  const operator = adminOperator(c);
  const result = await updateAdminTag(operator.adminId, id, input.name, operator.ip);
  await invalidateCache('tags', 'albums', 'site');
  return success(c, result, '标签已更新');
}

/** POST /api/admin/tags/:id/toggle —— 在显示（status=1）/隐藏（status=0）之间切换。 */
export async function toggle(c: AppContext, id: number) {
  const operator = adminOperator(c);
  const result = await toggleAdminTag(operator.adminId, id, operator.ip);
  await invalidateCache('tags', 'site');
  return success(c, result, result.status === 1 ? '标签已恢复展示' : '标签已隐藏');
}

/** DELETE /api/admin/tags/:id —— 仅未被收录的标签可删，service 内会再次校验。 */
export async function remove(c: AppContext, id: number) {
  const operator = adminOperator(c);
  await deleteAdminTag(operator.adminId, id, operator.ip);
  await invalidateCache('tags', 'site');
  return success(c, null, '标签已删除');
}
