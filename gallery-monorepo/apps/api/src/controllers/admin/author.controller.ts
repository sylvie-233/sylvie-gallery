/**
 * 后台作者控制器：列表、新建、更新、显隐与软删除。
 * 作者信息会出现在前台图集与聚合数据中，写操作后按需失效缓存。
 */
import { invalidateCache } from '../../cache/index.js';
import {
  createAdminAuthor,
  deleteAdminAuthor,
  getAdminAuthors,
  toggleAdminAuthor,
  updateAdminAuthor,
} from '../../services/admin/author-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { AuthorInput, AuthorListInput } from '../../validators/admin/catalog.js';
import { adminOperator } from './helpers.js';

/** GET /api/admin/authors —— 参数来自 query，按状态与关键词分页查询作者。 */
export async function list(c: AppContext, query: AuthorListInput): Promise<Response> {
  return success(c, await getAdminAuthors(query));
}

/** POST /api/admin/authors —— 入参来自校验后的 body；创建后失效作者与站点缓存。 */
export async function create(c: AppContext, input: AuthorInput): Promise<Response> {
  const operator = adminOperator(c);
  const result = await createAdminAuthor(operator.adminId, input, operator.ip);
  await invalidateCache('authors', 'site');
  return success(c, result, '作者已创建', 201);
}

/** PUT /api/admin/authors/:id —— 作者名等资料会展示在图集详情，需连带失效图集缓存。 */
export async function update(c: AppContext, id: number, input: AuthorInput): Promise<Response> {
  const operator = adminOperator(c);
  const result = await updateAdminAuthor(operator.adminId, id, input, operator.ip);
  await invalidateCache('authors', 'albums', 'site');
  return success(c, result, '作者已更新');
}

/** POST /api/admin/authors/:id/toggle —— 在显示（status=1）/隐藏（status=0）之间切换。 */
export async function toggle(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  const result = await toggleAdminAuthor(operator.adminId, id, operator.ip);
  await invalidateCache('authors', 'site');
  return success(c, result, result.status === 1 ? '作者已恢复展示' : '作者已隐藏');
}

/** DELETE /api/admin/authors/:id —— 软删除作者，并失效作者、图集与站点缓存。 */
export async function remove(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAdminAuthor(operator.adminId, id, operator.ip);
  await invalidateCache('authors', 'albums', 'site');
  return success(c, null, '作者已删除');
}
