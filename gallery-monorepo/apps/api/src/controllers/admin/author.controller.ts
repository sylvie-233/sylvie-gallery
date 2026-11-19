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

/** GET /api/admin/authors */
export async function list(c: AppContext, query: AuthorListInput): Promise<Response> {
  return success(c, await getAdminAuthors(query));
}

/** POST /api/admin/authors */
export async function create(c: AppContext, input: AuthorInput): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await createAdminAuthor(operator.adminId, input, operator.ip),
    '作者已创建',
    201,
  );
}

/** PUT /api/admin/authors/:id */
export async function update(c: AppContext, id: number, input: AuthorInput): Promise<Response> {
  const operator = adminOperator(c);
  return success(c, await updateAdminAuthor(operator.adminId, id, input, operator.ip), '作者已更新');
}

/** POST /api/admin/authors/:id/toggle */
export async function toggle(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  const result = await toggleAdminAuthor(operator.adminId, id, operator.ip);
  return success(c, result, result.status === 1 ? '作者已恢复展示' : '作者已隐藏');
}

/** DELETE /api/admin/authors/:id */
export async function remove(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAdminAuthor(operator.adminId, id, operator.ip);
  return success(c, null, '作者已删除');
}
