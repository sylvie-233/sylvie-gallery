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

/** GET /api/admin/tags */
export async function list(c: AppContext, query: TagListInput): Promise<Response> {
  return success(c, await getAdminTags(query));
}

/** POST /api/admin/tags */
export async function create(c: AppContext, input: TagNameInput): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await createAdminTag(operator.adminId, input.name, operator.ip),
    '标签已创建',
    201,
  );
}

/** PUT /api/admin/tags/:id */
export async function update(c: AppContext, id: number, input: TagNameInput): Promise<Response> {
  const operator = adminOperator(c);
  return success(c, await updateAdminTag(operator.adminId, id, input.name, operator.ip), '标签已更新');
}

/** POST /api/admin/tags/:id/toggle */
export async function toggle(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  const result = await toggleAdminTag(operator.adminId, id, operator.ip);
  return success(c, result, result.status === 1 ? '标签已恢复展示' : '标签已隐藏');
}

/** DELETE /api/admin/tags/:id */
export async function remove(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAdminTag(operator.adminId, id, operator.ip);
  return success(c, null, '标签已删除');
}
