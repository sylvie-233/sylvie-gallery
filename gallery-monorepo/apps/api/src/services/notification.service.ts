import {
  NOTIFICATION_TYPE_LABELS,
  type NotificationDto,
  type NotificationType,
  type PageResult,
} from '@sylvie/types';

import { dbClient } from '../db/index.js';
import { HttpError } from '../utils/http.js';
import { normalizePage, toBool, toPageResult } from '../utils/format.js';

interface NotificationRow {
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
  const where = unreadOnly
    ? 'n.user_id = ? AND n.is_read = 0'
    : 'n.user_id = ?';
  const params: unknown[] = [userId];

  const [countRow, unreadRow] = await Promise.all([
    dbClient.queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM user_notification n WHERE ${where}`,
      params,
    ),
    dbClient.queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM user_notification WHERE user_id = ? AND is_read = 0`,
      [userId],
    ),
  ]);

  const rows = await dbClient.query<NotificationRow>(
    `SELECT n.id, n.type, n.title, n.content, n.is_read AS isRead, n.read_at AS readAt,
            n.created_at AS createdAt, n.album_id AS albumId, a.title AS albumTitle,
            a.cover_url AS coverUrl, a.image_count AS imageCount, a.video_count AS videoCount,
            a.published_at AS publishedAt, au.name AS authorName
       FROM user_notification n
       LEFT JOIN album a ON a.id = n.album_id AND a.is_deleted = 0
       LEFT JOIN author au ON au.id = a.author_id
      WHERE ${where}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  const result = toPageResult(rows.map(mapNotification), Number(countRow?.total ?? 0), page, pageSize);
  return { ...result, unread: Number(unreadRow?.total ?? 0) };
}

export async function markNotificationRead(userId: number, notificationId: number): Promise<void> {
  const row = await dbClient.queryOne<{ id: number }>(
    `SELECT id FROM user_notification WHERE id = ? AND user_id = ? LIMIT 1`,
    [notificationId, userId],
  );
  if (!row) {
    throw new HttpError(404, '通知不存在');
  }
  await dbClient.execute(
    `UPDATE user_notification SET is_read = 1, read_at = COALESCE(read_at, NOW())
      WHERE id = ? AND user_id = ?`,
    [notificationId, userId],
  );
}

export async function markAllNotificationsRead(userId: number): Promise<void> {
  await dbClient.execute(
    `UPDATE user_notification SET is_read = 1, read_at = COALESCE(read_at, NOW())
      WHERE user_id = ? AND is_read = 0`,
    [userId],
  );
}
