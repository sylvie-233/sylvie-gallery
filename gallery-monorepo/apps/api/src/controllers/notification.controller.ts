/**
 * 前台通知控制器：通知分页、单条已读与全部已读。
 * 所有操作都以当前登录用户为范围，服务层负责归属校验。
 */
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notification.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import type { NotificationQueryInput } from '../validators/misc.js';
import { requireUser } from './helpers.js';

/**
 * GET /api/notifications —— 我的通知分页。
 *
 * @param query 路由校验后的 notificationQuerySchema（分页与 all/unread 过滤）
 * 响应同时携带未读总数，供前端红点提示。
 */
export async function list(c: AppContext, query: NotificationQueryInput) {
  return success(c, await listNotifications(requireUser(c).id, query));
}

/**
 * POST /api/notifications/:id/read —— 标记单条通知已读。
 *
 * @param id 通知 ID；服务层校验归属，防止操作他人通知。
 */
export async function read(c: AppContext, id: number) {
  await markNotificationRead(requireUser(c).id, id);
  return success(c, null, '已标记为已读');
}

/** POST /api/notifications/read-all —— 当前用户全部未读通知标记为已读（幂等）。 */
export async function readAll(c: AppContext) {
  await markAllNotificationsRead(requireUser(c).id);
  return success(c, null, '全部通知已标记为已读');
}
