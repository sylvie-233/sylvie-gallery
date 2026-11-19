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

export async function markNotificationRead(userId: number, notificationId: number): Promise<void> {
  const ownerStatement = selectNotificationForUser(notificationId, userId);
  const row = await dbClient.queryOne<{ id: number }>(ownerStatement.sql, ownerStatement.params);
  if (!row) {
    throw new HttpError(404, '通知不存在');
  }
  const statement = markNotificationReadStatement(notificationId, userId);
  await dbClient.execute(statement.sql, statement.params);
}

export async function markAllNotificationsRead(userId: number): Promise<void> {
  const statement = markAllNotificationsReadStatement(userId);
  await dbClient.execute(statement.sql, statement.params);
}
