import type { NotificationType } from '@sylvie/types';

import type { SqlFragment, SqlStatement } from './shared.js';

/** 通知行：关联图集与作者摘要。 */
export interface NotificationRow {
  id: number;
  type: NotificationType;
  title: string;
  content: string;
  isRead: number;
  readAt: string | null;
  createdAt: string;
  albumId: number | null;
  albumTitle: string | null;
  coverUrl: string | null;
  imageCount: number | null;
  videoCount: number | null;
  publishedAt: string | null;
  authorName: string | null;
}

/** 通知列表 WHERE 条件（全部 / 仅未读）。 */
export function buildNotificationWhere(userId: number, unreadOnly: boolean): SqlFragment {
  return unreadOnly
    ? { sql: 'n.user_id = ? AND n.is_read = 0', params: [userId] }
    : { sql: 'n.user_id = ?', params: [userId] };
}

/** 按筛选条件统计通知总数。 */
export function countNotifications(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM user_notification n WHERE ${where.sql}`,
    params: [...where.params],
  };
}

/** 未读通知总数。 */
export function countUnreadNotifications(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM user_notification WHERE user_id = ? AND is_read = 0`,
    params: [userId],
  };
}

/** 分页通知列表，关联图集与作者。 */
export function selectNotifications(
  where: SqlFragment,
  limit: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT n.id, n.type, n.title, n.content, n.is_read AS isRead, n.read_at AS readAt,
            n.created_at AS createdAt, n.album_id AS albumId, a.title AS albumTitle,
            a.cover_url AS coverUrl, a.image_count AS imageCount, a.video_count AS videoCount,
            a.published_at AS publishedAt, au.name AS authorName
       FROM user_notification n
       LEFT JOIN album a ON a.id = n.album_id AND a.is_deleted = 0
       LEFT JOIN author au ON au.id = a.author_id
      WHERE ${where.sql}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ? OFFSET ?`,
    params: [...where.params, limit, offset],
  };
}

/** 查询归属当前用户的通知。 */
export function selectNotificationForUser(
  notificationId: number,
  userId: number,
): SqlStatement {
  return {
    sql: `SELECT id FROM user_notification WHERE id = ? AND user_id = ? LIMIT 1`,
    params: [notificationId, userId],
  };
}

/** 单条通知标记已读。 */
export function markNotificationRead(notificationId: number, userId: number): SqlStatement {
  return {
    sql: `UPDATE user_notification SET is_read = 1, read_at = COALESCE(read_at, NOW())
      WHERE id = ? AND user_id = ?`,
    params: [notificationId, userId],
  };
}

/** 全部未读通知标记已读。 */
export function markAllNotificationsRead(userId: number): SqlStatement {
  return {
    sql: `UPDATE user_notification SET is_read = 1, read_at = COALESCE(read_at, NOW())
      WHERE user_id = ? AND is_read = 0`,
    params: [userId],
  };
}
