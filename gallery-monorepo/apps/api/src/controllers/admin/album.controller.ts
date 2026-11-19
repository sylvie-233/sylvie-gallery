/**
 * 后台图集控制器：列表、详情与保存/上下架/推荐/删除等写操作。
 * 写入后按影响范围失效前台图集、标签、作者与站点缓存。
 */
import { invalidateCache } from '../../cache/index.js';
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

/** GET /api/admin/albums —— 参数来自 query，按状态与关键词分页查询后台图集。 */
export async function list(c: AppContext, query: AlbumListInput): Promise<Response> {
  return success(c, await getAdminAlbums(query));
}

/** GET /api/admin/albums/:id —— id 取自路径参数，返回含全部媒体的详情。 */
export async function detail(c: AppContext, id: number): Promise<Response> {
  return success(c, await getAdminAlbumDetail(id));
}

/**
 * 图集写操作会影响前台列表、标签收录数、作者统计与首页数据。
 * 因此统一失效 albums/tags/authors/site 四个缓存域。
 */
async function invalidateAlbumCaches(): Promise<void> {
  await invalidateCache('albums', 'tags', 'authors', 'site');
}

/** POST /api/admin/albums —— 入参来自校验后的 body（id=null 表示新建）；写库后失效图集相关缓存。 */
export async function create(c: AppContext, input: AlbumSaveInput): Promise<Response> {
  const operator = adminOperator(c);
  const result = await saveAdminAlbum(operator.adminId, input, null, operator.ip);
  await invalidateAlbumCaches();
  return success(c, result, '图集已保存', 201);
}

/** PUT /api/admin/albums/:id —— 更新已有图集；标签收录数与作者统计由 service 在同事务维护。 */
export async function update(c: AppContext, id: number, input: AlbumSaveInput): Promise<Response> {
  const operator = adminOperator(c);
  const result = await saveAdminAlbum(operator.adminId, input, id, operator.ip);
  await invalidateAlbumCaches();
  return success(c, result, '图集已更新');
}

/** POST /api/admin/albums/:id/status —— 发布或下架；status 枚举由 schema 限定为 published/offline。 */
export async function updateStatus(
  c: AppContext,
  id: number,
  input: AlbumStatusInput,
): Promise<Response> {
  const operator = adminOperator(c);
  const result = await updateAdminAlbumStatus(operator.adminId, id, input.status, operator.ip);
  await invalidateAlbumCaches();
  return success(c, result, input.status === 'published' ? '图集已发布' : '图集已下架');
}

/** POST /api/admin/albums/:id/recommend —— 切换推荐池标记。 */
export async function toggleRecommend(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  const result = await toggleAdminAlbumRecommend(operator.adminId, id, operator.ip);
  // 推荐标记只影响图集列表与首页聚合，无需失效标签/作者缓存。
  await invalidateCache('albums', 'site');
  return success(c, result, result.isRecommended ? '已加入推荐池' : '已移出推荐池');
}

/** DELETE /api/admin/albums/:id —— 软删除图集，并同步回收标签收录数与作者图集数。 */
export async function remove(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAdminAlbum(operator.adminId, id, operator.ip);
  await invalidateAlbumCaches();
  return success(c, null, '图集已删除');
}
