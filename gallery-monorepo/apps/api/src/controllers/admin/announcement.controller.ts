/**
 * 后台公告控制器：列表、发布、更新、上下线与软删除。
 * 所有写操作后失效公告与站点聚合缓存。
 */
import { invalidateCache } from '../../cache/index.js';
import {
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  getAdminAnnouncements,
  toggleAdminAnnouncement,
  updateAdminAnnouncement,
} from '../../services/admin/announcement-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { AnnouncementListInput, AnnouncementSaveInput } from '../../validators/admin/content.js';
import { adminOperator } from './helpers.js';

/** GET /api/admin/announcements —— 参数来自 query，按类型、状态、关键词与日期分页查询。 */
export async function list(c: AppContext, query: AnnouncementListInput): Promise<Response> {
  return success(c, await getAdminAnnouncements(query));
}

/** POST /api/admin/announcements —— 入参来自校验后的 body；创建后失效公告与站点缓存。 */
export async function create(c: AppContext, input: AnnouncementSaveInput): Promise<Response> {
  const operator = adminOperator(c);
  const result = await createAdminAnnouncement(operator.adminId, input, operator.ip);
  await invalidateCache('announcements', 'site');
  return success(c, result, '公告已发布', 201);
}

/** PUT /api/admin/announcements/:id —— 更新公告内容；service 写管理日志。 */
export async function update(
  c: AppContext,
  id: number,
  input: AnnouncementSaveInput,
): Promise<Response> {
  const operator = adminOperator(c);
  const result = await updateAdminAnnouncement(operator.adminId, id, input, operator.ip);
  await invalidateCache('announcements', 'site');
  return success(c, result, '公告已更新');
}

/** POST /api/admin/announcements/:id/toggle —— 在发布（status=1）与下线（status=0）之间切换。 */
export async function toggle(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  const result = await toggleAdminAnnouncement(operator.adminId, id, operator.ip);
  await invalidateCache('announcements', 'site');
  return success(c, result, result.status === 1 ? '公告已发布' : '公告已下线');
}

/** DELETE /api/admin/announcements/:id —— 软删除公告，前台查询即时不可见。 */
export async function remove(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAdminAnnouncement(operator.adminId, id, operator.ip);
  await invalidateCache('announcements', 'site');
  return success(c, null, '公告已删除');
}
