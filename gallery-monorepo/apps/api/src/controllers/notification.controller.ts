import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notification.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import type { NotificationQueryInput } from '../validators/misc.js';
import { requireUser } from './helpers.js';

/** GET /api/notifications */
export async function list(c: AppContext, query: NotificationQueryInput): Promise<Response> {
  return success(c, await listNotifications(requireUser(c).id, query));
}

/** POST /api/notifications/:id/read */
export async function read(c: AppContext, id: number): Promise<Response> {
  await markNotificationRead(requireUser(c).id, id);
  return success(c, null, '已标记为已读');
}

/** POST /api/notifications/read-all */
export async function readAll(c: AppContext): Promise<Response> {
  await markAllNotificationsRead(requireUser(c).id);
  return success(c, null, '全部通知已标记为已读');
}
