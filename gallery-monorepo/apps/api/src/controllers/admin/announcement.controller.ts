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

/** GET /api/admin/announcements */
export async function list(c: AppContext, query: AnnouncementListInput): Promise<Response> {
  return success(c, await getAdminAnnouncements(query));
}

/** POST /api/admin/announcements */
export async function create(c: AppContext, input: AnnouncementSaveInput): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await createAdminAnnouncement(operator.adminId, input, operator.ip),
    '公告已发布',
    201,
  );
}

/** PUT /api/admin/announcements/:id */
export async function update(
  c: AppContext,
  id: number,
  input: AnnouncementSaveInput,
): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await updateAdminAnnouncement(operator.adminId, id, input, operator.ip),
    '公告已更新',
  );
}

/** POST /api/admin/announcements/:id/toggle */
export async function toggle(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  const result = await toggleAdminAnnouncement(operator.adminId, id, operator.ip);
  return success(c, result, result.status === 1 ? '公告已发布' : '公告已下线');
}

/** DELETE /api/admin/announcements/:id */
export async function remove(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAdminAnnouncement(operator.adminId, id, operator.ip);
  return success(c, null, '公告已删除');
}
