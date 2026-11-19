import type { NotificationType } from '@sylvie/types';

import type { SqlFragment, SqlStatement } from './shared.js';

/**
 * 前台站内通知 SQL：列表 / 未读数 / 已读标记。
 * 所有查询都限定 `user_id`，防止越权读取他人通知；图集关联按未软删除过滤。
 */

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

/**
 * 通知列表 WHERE 条件。
 * 始终限定当前用户；`unreadOnly` 为 true 时追加 `is_read = 0`（仅未读筛选）。
 */
export function buildNotificationWhere(userId: number, unreadOnly: boolean): SqlFragment {
  return unreadOnly
    ? { sql: 'n.user_id = ? AND n.is_read = 0', params: [userId] }
    : { sql: 'n.user_id = ?', params: [userId] };
}

/** 按筛选条件统计通知总数（分页 total）。 */
export function countNotifications(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM user_notification n WHERE ${where.sql}`,
    params: [...where.params],
  };
}

/** 当前用户未读通知总数，用于红点角标。 */
export function countUnreadNotifications(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM user_notification WHERE user_id = ? AND is_read = 0`,
    params: [userId],
  };
}

/**
 * 分页通知列表，LEFT JOIN 图集与作者摘要。
 * `where` 为筛选条件；按创建时间、id 倒序，`limit` / `offset` 由 service 归一化。
 */
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

/** 校验通知归属当前用户（用于标记已读前的越权检查）。 */
export function selectNotificationForUser(
  notificationId: number,
  userId: number,
): SqlStatement {
  return {
    sql: `SELECT id FROM user_notification WHERE id = ? AND user_id = ? LIMIT 1`,
    params: [notificationId, userId],
  };
}

/**
 * 单条通知标记已读。
 * `COALESCE(read_at, NOW())` 保证首次已读时间不被后续重复标记覆盖。
 */
export function markNotificationRead(notificationId: number, userId: number): SqlStatement {
  return {
    sql: `UPDATE user_notification SET is_read = 1, read_at = COALESCE(read_at, NOW())
      WHERE id = ? AND user_id = ?`,
    params: [notificationId, userId],
  };
}

/** 将当前用户全部未读通知标记已读，同样保留首次已读时间。 */
export function markAllNotificationsRead(userId: number): SqlStatement {
  return {
    sql: `UPDATE user_notification SET is_read = 1, read_at = COALESCE(read_at, NOW())
      WHERE user_id = ? AND is_read = 0`,
    params: [userId],
  };
}
