import {
  deleteAdminAlbum,
  getAdminAlbumDetail,
  getAdminAlbums,
  saveAdminAlbum,
  toggleAdminAlbumRecommend,
  updateAdminAlbumStatus,
} from '../../services/admin/album-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type {
  AlbumListInput,
  AlbumSaveInput,
  AlbumStatusInput,
} from '../../validators/admin/catalog.js';
import { adminOperator } from './helpers.js';

/** GET /api/admin/albums */
export async function list(c: AppContext, query: AlbumListInput): Promise<Response> {
  return success(c, await getAdminAlbums(query));
}

/** GET /api/admin/albums/:id */
export async function detail(c: AppContext, id: number): Promise<Response> {
  return success(c, await getAdminAlbumDetail(id));
}

/** POST /api/admin/albums */
export async function create(c: AppContext, input: AlbumSaveInput): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await saveAdminAlbum(operator.adminId, input, null, operator.ip),
    '图集已保存',
    201,
  );
}

/** PUT /api/admin/albums/:id */
export async function update(c: AppContext, id: number, input: AlbumSaveInput): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await saveAdminAlbum(operator.adminId, input, id, operator.ip),
    '图集已更新',
  );
}

/** POST /api/admin/albums/:id/status */
export async function updateStatus(
  c: AppContext,
  id: number,
  input: AlbumStatusInput,
): Promise<Response> {
  const operator = adminOperator(c);
  const result = await updateAdminAlbumStatus(operator.adminId, id, input.status, operator.ip);
  return success(c, result, input.status === 'published' ? '图集已发布' : '图集已下架');
}

/** POST /api/admin/albums/:id/recommend */
export async function toggleRecommend(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  const result = await toggleAdminAlbumRecommend(operator.adminId, id, operator.ip);
  return success(c, result, result.isRecommended ? '已加入推荐池' : '已移出推荐池');
}

/** DELETE /api/admin/albums/:id */
export async function remove(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAdminAlbum(operator.adminId, id, operator.ip);
  return success(c, null, '图集已删除');
}
