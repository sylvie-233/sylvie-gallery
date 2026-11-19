import type { CommentStatus, Role } from '@sylvie/types';

import { placeholders, type SqlFragment, type SqlStatement } from '../shared.js';

/** 管理后台评论列表行。 */
export interface CommentRow {
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

/** 审核时加锁读取的评论行。 */
export interface ReviewCommentRow {
  id: number;
  albumId: number;
  userId: number;
  status: CommentStatus;
  content: string;
  albumTitle: string;
}

/** 删除时加锁读取的评论行。 */
export interface DeleteCommentRow {
  id: number;
  albumId: number;
  parentId: number | null;
  content: string;
  status: CommentStatus;
}

export interface CommentListFilter {
  status: CommentStatus;
  keyword?: string;
  from?: string;
  to?: string;
}

const COMMENT_SELECT = `c.id, c.album_id AS albumId, a.title AS albumTitle,
  c.parent_id AS parentId, ru.nickname AS replyToName, c.content, c.status,
  c.created_at AS createdAt, u.id AS userId, u.nickname,
  u.avatar_type AS avatarType, u.avatar_index AS avatarIndex, u.avatar_url AS avatarUrl, u.role`;

const COMMENT_FROM = `FROM comment c
  JOIN \`user\` u ON u.id = c.user_id
  JOIN album a ON a.id = c.album_id
  LEFT JOIN \`user\` ru ON ru.id = c.reply_to_user_id`;

/** 评论列表筛选条件。 */
export function buildCommentWhere(filter: CommentListFilter): SqlFragment {
  const conditions = ['c.is_deleted = 0'];
  const params: unknown[] = [];

  conditions.push('c.status = ?');
  params.push(filter.status);

  const keyword = filter.keyword?.trim() ?? '';
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(u.nickname LIKE ? OR c.content LIKE ? OR a.title LIKE ?)');
    params.push(like, like, like);
  }
  if (filter.from) {
    conditions.push('DATE(c.created_at) >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push('DATE(c.created_at) <= ?');
    params.push(filter.to);
  }

  return { sql: conditions.join(' AND '), params };
}

export function countAdminComments(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total ${COMMENT_FROM} WHERE ${where.sql}`,
    params: where.params,
  };
}

export function selectAdminComments(
  where: SqlFragment,
  limit: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT ${COMMENT_SELECT} ${COMMENT_FROM}
      WHERE ${where.sql}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ? OFFSET ?`,
    params: [...where.params, limit, offset],
  };
}

export function recomputeAlbumCommentCount(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET comment_count = (
       SELECT COUNT(*) FROM comment WHERE album_id = ? AND status = 'approved' AND is_deleted = 0
     ) WHERE id = ?`,
    params: [albumId, albumId],
  };
}

export function selectCommentForReview(commentId: number): SqlStatement {
  return {
    sql: `SELECT c.id, c.album_id AS albumId, c.user_id AS userId, c.status,
              c.content, a.title AS albumTitle
         FROM comment c JOIN album a ON a.id = c.album_id
        WHERE c.id = ? AND c.is_deleted = 0
        FOR UPDATE`,
    params: [commentId],
  };
}

export function updateCommentStatus(
  commentStatus: 'approved' | 'rejected',
  commentId: number,
): SqlStatement {
  return {
    sql: `UPDATE comment SET status = ? WHERE id = ?`,
    params: [commentStatus, commentId],
  };
}

export function insertReviewNotification(
  userId: number,
  title: string,
  content: string,
  albumId: number,
): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content, album_id)
       VALUES (?, 'review', ?, ?, ?)`,
    params: [userId, title, content, albumId],
  };
}

export function selectAdminCommentById(commentId: number): SqlStatement {
  return {
    sql: `SELECT ${COMMENT_SELECT} ${COMMENT_FROM}
      WHERE c.id = ? AND c.is_deleted = 0 LIMIT 1`,
    params: [commentId],
  };
}

export function selectCommentForDelete(commentId: number): SqlStatement {
  return {
    sql: `SELECT id, album_id AS albumId, parent_id AS parentId, content, status
         FROM comment WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
    params: [commentId],
  };
}

export function selectCommentReplies(commentId: number): SqlStatement {
  return {
    sql: `SELECT id FROM comment WHERE parent_id = ? AND is_deleted = 0`,
    params: [commentId],
  };
}

export function softDeleteComments(ids: number[]): SqlStatement {
  return {
    sql: `UPDATE comment SET status = 'deleted', is_deleted = 1 WHERE id IN (${placeholders(ids.length)})`,
    params: ids,
  };
}

export function countPendingComments(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM comment WHERE status = 'pending' AND is_deleted = 0`,
    params: [],
  };
}
