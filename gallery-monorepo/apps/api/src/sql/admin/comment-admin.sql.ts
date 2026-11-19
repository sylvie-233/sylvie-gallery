/**
 * 后台评论的参数化 SQL：筛选列表与总数、审核 / 删除时的加锁读取、状态更新、
 * 站内通知写入、回复查询、批量软删除、图集评论数重算与待审数量。
 *
 * 审核 / 删除读取使用 FOR UPDATE，必须放在 service 的事务中执行。
 */
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

/** 评论列表筛选参数：状态（必选）、关键字与创建日期区间。 */
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

/**
 * 构建评论列表 WHERE 片段。
 *
 * - 固定条件：c.is_deleted = 0；
 * - status 必选（由 service 归一化，非法值回退 pending）；
 * - keyword 去空白后匹配用户昵称、评论内容、图集标题；
 * - from / to 以 DATE(c.created_at) 做闭区间过滤。
 */
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

/** 统计当前筛选条件下的评论总数（与列表共用 FROM / JOIN）。 */
export function countAdminComments(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total ${COMMENT_FROM} WHERE ${where.sql}`,
    params: where.params,
  };
}

/** 评论分页列表：按创建时间倒序、id 倒序；limit / offset 由调用方计算。 */
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

/**
 * 重算图集评论数冗余字段 album.comment_count。
 *
 * 只统计该图集 status = 'approved' 且未软删除的评论；审核或删除后必须与状态变更同事务调用。
 */
export function recomputeAlbumCommentCount(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET comment_count = (
       SELECT COUNT(*) FROM comment WHERE album_id = ? AND status = 'approved' AND is_deleted = 0
     ) WHERE id = ?`,
    params: [albumId, albumId],
  };
}

/**
 * 审核前加锁读取评论（FOR UPDATE），并带出图集标题用于通知文案。
 * 必须在事务内执行，避免并发审核互相覆盖。
 */
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

/** 更新评论审核状态为 approved / rejected。 */
export function updateCommentStatus(
  commentStatus: 'approved' | 'rejected',
  commentId: number,
): SqlStatement {
  return {
    sql: `UPDATE comment SET status = ? WHERE id = ?`,
    params: [commentStatus, commentId],
  };
}

/** 写入审核结果站内通知（type = 'review'），关联图集便于前端跳转。 */
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

/** 删除前加锁读取评论（FOR UPDATE），获取 albumId 用于重算评论数。 */
export function selectCommentForDelete(commentId: number): SqlStatement {
  return {
    sql: `SELECT id, album_id AS albumId, parent_id AS parentId, content, status
         FROM comment WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
    params: [commentId],
  };
}

/** 查询某条评论下未删除的直接回复（仅一级）。 */
export function selectCommentReplies(commentId: number): SqlStatement {
  return {
    sql: `SELECT id FROM comment WHERE parent_id = ? AND is_deleted = 0`,
    params: [commentId],
  };
}

/**
 * 批量软删除评论：同时置 status = 'deleted'、is_deleted = 1。
 * IN 占位符按 ids 数量动态生成；调用方保证列表非空。
 */
export function softDeleteComments(ids: number[]): SqlStatement {
  return {
    sql: `UPDATE comment SET status = 'deleted', is_deleted = 1 WHERE id IN (${placeholders(ids.length)})`,
    params: ids,
  };
}

/** 统计待审核评论数（status = 'pending' 且未软删除）。 */
export function countPendingComments(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM comment WHERE status = 'pending' AND is_deleted = 0`,
    params: [],
  };
}
