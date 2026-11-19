/**
 * 前台通知业务：分页列表（全部 / 仅未读）、未读数与已读标记。
 * 所有操作都限定当前用户，标记已读前先校验通知归属。
 */
import {
  NOTIFICATION_TYPE_LABELS,
  type NotificationDto,
  type PageResult,
} from '@sylvie/types';

import { dbClient } from '../db/index.js';
import {
  buildNotificationWhere,
  countNotifications,
  countUnreadNotifications,
  markAllNotificationsRead as markAllNotificationsReadStatement,
  markNotificationRead as markNotificationReadStatement,
  selectNotificationForUser,
  selectNotifications,
  type NotificationRow,
} from '../sql/notification.sql.js';
import { HttpError } from '../utils/http.js';
import { normalizePage, toBool, toPageResult } from '../utils/format.js';

/** 映射通知 DTO：仅当图集仍存在时附带图集摘要，否则 `album` 为 null。 */
function mapNotification(row: NotificationRow): NotificationDto {
  return {
    id: Number(row.id),
    type: row.type,
    typeLabel: NOTIFICATION_TYPE_LABELS[row.type] ?? row.type,
    title: row.title,
    content: row.content,
    album:
      row.albumId && row.albumTitle
        ? {
            id: Number(row.albumId),
            title: row.albumTitle,
            coverUrl: row.coverUrl ?? '',
            imageCount: Number(row.imageCount ?? 0),
            videoCount: Number(row.videoCount ?? 0),
            authorName: row.authorName ?? '',
            publishedAt: row.publishedAt ?? '',
          }
        : null,
    isRead: toBool(row.isRead),
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

/**
 * 通知分页列表：`filter='unread'` 时仅未读，默认每页 5 条。
 * 返回分页结果并附加当前用户未读总数；总数与未读数并发查询。
 */
export async function listNotifications(
  userId: number,
  query: { page?: number; pageSize?: number; filter?: 'all' | 'unread' },
): Promise<PageResult<NotificationDto> & { unread: number }> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 5);
  const unreadOnly = query.filter === 'unread';
  const where = buildNotificationWhere(userId, unreadOnly);

  const countStatement = countNotifications(where);
  const unreadStatement = countUnreadNotifications(userId);
  const [countRow, unreadRow] = await Promise.all([
    dbClient.queryOne<{ total: number }>(countStatement.sql, countStatement.params),
    dbClient.queryOne<{ total: number }>(unreadStatement.sql, unreadStatement.params),
  ]);

  const listStatement = selectNotifications(where, pageSize, offset);
  const rows = await dbClient.query<NotificationRow>(listStatement.sql, listStatement.params);

  const result = toPageResult(rows.map(mapNotification), Number(countRow?.total ?? 0), page, pageSize);
  return { ...result, unread: Number(unreadRow?.total ?? 0) };
}

/** 单条通知标记已读：先校验归属，通知不存在或不属于当前用户返回 404。 */
export async function markNotificationRead(userId: number, notificationId: number): Promise<void> {
  const ownerStatement = selectNotificationForUser(notificationId, userId);
  const row = await dbClient.queryOne<{ id: number }>(ownerStatement.sql, ownerStatement.params);
  if (!row) {
    throw new HttpError(404, '通知不存在');
  }
  const statement = markNotificationReadStatement(notificationId, userId);
  await dbClient.execute(statement.sql, statement.params);
}

/** 当前用户全部未读通知标记已读。 */
export async function markAllNotificationsRead(userId: number): Promise<void> {
  const statement = markAllNotificationsReadStatement(userId);
  await dbClient.execute(statement.sql, statement.params);
}
