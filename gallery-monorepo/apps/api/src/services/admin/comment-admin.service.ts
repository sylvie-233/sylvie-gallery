import type { AdminCommentRow, CommentStatus, PageResult, Role } from '@sylvie/types';

import { dbClient, queryOn, queryOneOn, type TransactionConnection } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toPageResult } from '../../utils/format.js';
import { logAdminOp } from './log.service.js';

interface CommentDbRow {
  id: number;
  albumId: number;
  albumTitle: string;
  parentId: number | null;
  replyToName: string | null;
  content: string;
  status: CommentStatus;
  createdAt: string;
  userId: number;
  nickname: string;
  avatarType: number;
  avatarIndex: number;
  avatarUrl: string | null;
  role: Role;
}

const COMMENT_SELECT = `c.id, c.album_id AS albumId, a.title AS albumTitle,
  c.parent_id AS parentId, ru.nickname AS replyToName, c.content, c.status,
  c.created_at AS createdAt, u.id AS userId, u.nickname,
  u.avatar_type AS avatarType, u.avatar_index AS avatarIndex, u.avatar_url AS avatarUrl, u.role`;

const COMMENT_FROM = `FROM comment c
  JOIN \`user\` u ON u.id = c.user_id
  JOIN album a ON a.id = c.album_id
  LEFT JOIN \`user\` ru ON ru.id = c.reply_to_user_id`;

function mapComment(row: CommentDbRow): AdminCommentRow {
  return {
    id: Number(row.id),
    albumId: Number(row.albumId),
    albumTitle: row.albumTitle,
    parentId: row.parentId === null ? null : Number(row.parentId),
    replyToName: row.replyToName,
    content: row.content,
    status: row.status,
    createdAt: row.createdAt,
    user: {
      id: Number(row.userId),
      nickname: row.nickname,
      avatarType: Number(row.avatarType),
      avatarIndex: Number(row.avatarIndex),
      avatarUrl: row.avatarUrl,
      role: row.role,
    },
  };
}

export async function getAdminComments(query: {
  status?: string;
  keyword?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<AdminCommentRow>> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 5);
  const conditions = ['c.is_deleted = 0'];
  const params: unknown[] = [];

  const status =
    query.status === 'approved' || query.status === 'rejected' || query.status === 'pending'
      ? query.status
      : 'pending';
  conditions.push('c.status = ?');
  params.push(status);

  const keyword = query.keyword?.trim() ?? '';
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(u.nickname LIKE ? OR c.content LIKE ? OR a.title LIKE ?)');
    params.push(like, like, like);
  }
  if (query.from) {
    conditions.push('DATE(c.created_at) >= ?');
    params.push(query.from);
  }
  if (query.to) {
    conditions.push('DATE(c.created_at) <= ?');
    params.push(query.to);
  }

  const where = conditions.join(' AND ');
  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total ${COMMENT_FROM} WHERE ${where}`,
    params,
  );
  const rows = await dbClient.query<CommentDbRow>(
    `SELECT ${COMMENT_SELECT} ${COMMENT_FROM}
      WHERE ${where}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  return toPageResult(rows.map(mapComment), Number(countRow?.total ?? 0), page, pageSize);
}

async function recomputeCommentCount(
  conn: TransactionConnection,
  albumId: number,
): Promise<void> {
  await conn.query(
    `UPDATE album SET comment_count = (
       SELECT COUNT(*) FROM comment WHERE album_id = ? AND status = 'approved' AND is_deleted = 0
     ) WHERE id = ?`,
    [albumId, albumId],
  );
}

export async function reviewAdminComment(
  adminId: number,
  commentId: number,
  status: 'approved' | 'rejected',
  ip?: string | null,
): Promise<AdminCommentRow> {
  await dbClient.transaction(async (conn) => {
    const comment = await queryOneOn<{
      id: number;
      albumId: number;
      userId: number;
      status: CommentStatus;
      content: string;
      albumTitle: string;
    }>(
      conn,
      `SELECT c.id, c.album_id AS albumId, c.user_id AS userId, c.status,
              c.content, a.title AS albumTitle
         FROM comment c JOIN album a ON a.id = c.album_id
        WHERE c.id = ? AND c.is_deleted = 0
        FOR UPDATE`,
      [commentId],
    );
    if (!comment) {
      throw new HttpError(404, '评论不存在');
    }
    if (comment.status === 'deleted') {
      throw new HttpError(400, '评论已删除，无法审核');
    }

    await conn.query(`UPDATE comment SET status = ? WHERE id = ?`, [status, commentId]);
    await recomputeCommentCount(conn, comment.albumId);
    await conn.query(
      `INSERT INTO user_notification (user_id, type, title, content, album_id)
       VALUES (?, 'review', ?, ?, ?)`,
      [
        comment.userId,
        status === 'approved' ? '评论审核通过' : '评论审核未通过',
        status === 'approved'
          ? `你在《${comment.albumTitle}》下的评论已通过审核并展示。`
          : `你在《${comment.albumTitle}》下的评论未通过审核。`,
        comment.albumId,
      ],
    );
  });

  await logAdminOp(
    adminId,
    'comment.review',
    'comment',
    commentId,
    { status },
    ip,
  );
  return getAdminComment(commentId);
}

async function getAdminComment(commentId: number): Promise<AdminCommentRow> {
  const row = await dbClient.queryOne<CommentDbRow>(
    `SELECT ${COMMENT_SELECT} ${COMMENT_FROM}
      WHERE c.id = ? AND c.is_deleted = 0 LIMIT 1`,
    [commentId],
  );
  if (!row) {
    throw new HttpError(404, '评论不存在');
  }
  return mapComment(row);
}

export async function deleteAdminComment(
  adminId: number,
  commentId: number,
  ip?: string | null,
): Promise<void> {
  await dbClient.transaction(async (conn) => {
    const comment = await queryOneOn<{
      id: number;
      albumId: number;
      parentId: number | null;
      content: string;
      status: CommentStatus;
    }>(
      conn,
      `SELECT id, album_id AS albumId, parent_id AS parentId, content, status
         FROM comment WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
      [commentId],
    );
    if (!comment) {
      throw new HttpError(404, '评论不存在');
    }

    const replyRows = await queryOn<{ id: number }>(
      conn,
      `SELECT id FROM comment WHERE parent_id = ? AND is_deleted = 0`,
      [commentId],
    );
    const ids = [commentId, ...replyRows.map((row) => Number(row.id))];
    const placeholders = ids.map(() => '?').join(', ');
    await conn.query(
      `UPDATE comment SET status = 'deleted', is_deleted = 1 WHERE id IN (${placeholders})`,
      ids,
    );
    await recomputeCommentCount(conn, comment.albumId);
  });

  await logAdminOp(adminId, 'comment.delete', 'comment', commentId, null, ip);
}

export async function getPendingCommentCount(): Promise<number> {
  const row = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM comment WHERE status = 'pending' AND is_deleted = 0`,
  );
  return Number(row?.total ?? 0);
}
