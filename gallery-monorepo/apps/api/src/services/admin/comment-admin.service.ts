import type { AdminCommentRow, CommentStatus, PageResult } from '@sylvie/types';

import { dbClient, queryOn, queryOneOn, type TransactionConnection } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toPageResult } from '../../utils/format.js';
import {
  buildCommentWhere,
  countAdminComments,
  countPendingComments,
  insertReviewNotification,
  recomputeAlbumCommentCount,
  selectAdminCommentById,
  selectAdminComments,
  selectCommentForDelete,
  selectCommentForReview,
  selectCommentReplies,
  softDeleteComments,
  updateCommentStatus,
  type CommentRow,
  type DeleteCommentRow,
  type ReviewCommentRow,
} from '../../sql/admin/comment-admin.sql.js';
import { logAdminOp } from './log.service.js';

function mapComment(row: CommentRow): AdminCommentRow {
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

  const status: CommentStatus =
    query.status === 'approved' || query.status === 'rejected' || query.status === 'pending'
      ? query.status
      : 'pending';
  const where = buildCommentWhere({
    status,
    keyword: query.keyword,
    from: query.from,
    to: query.to,
  });
  const countStatement = countAdminComments(where);
  const rowsStatement = selectAdminComments(where, pageSize, offset);

  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const rows = await dbClient.query<CommentRow>(rowsStatement.sql, rowsStatement.params);
  return toPageResult(rows.map(mapComment), Number(countRow?.total ?? 0), page, pageSize);
}

async function recomputeCommentCount(
  conn: TransactionConnection,
  albumId: number,
): Promise<void> {
  const statement = recomputeAlbumCommentCount(albumId);
  await conn.query(statement.sql, statement.params);
}

export async function reviewAdminComment(
  adminId: number,
  commentId: number,
  status: 'approved' | 'rejected',
  ip?: string | null,
): Promise<AdminCommentRow> {
  await dbClient.transaction(async (conn) => {
    const commentStatement = selectCommentForReview(commentId);
    const comment = await queryOneOn<ReviewCommentRow>(
      conn,
      commentStatement.sql,
      commentStatement.params,
    );
    if (!comment) {
      throw new HttpError(404, '评论不存在');
    }
    if (comment.status === 'deleted') {
      throw new HttpError(400, '评论已删除，无法审核');
    }

    const updateStatement = updateCommentStatus(status, commentId);
    await conn.query(updateStatement.sql, updateStatement.params);
    await recomputeCommentCount(conn, comment.albumId);
    const notificationStatement = insertReviewNotification(
      comment.userId,
      status === 'approved' ? '评论审核通过' : '评论审核未通过',
      status === 'approved'
        ? `你在《${comment.albumTitle}》下的评论已通过审核并展示。`
        : `你在《${comment.albumTitle}》下的评论未通过审核。`,
      comment.albumId,
    );
    await conn.query(notificationStatement.sql, notificationStatement.params);
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
  const statement = selectAdminCommentById(commentId);
  const row = await dbClient.queryOne<CommentRow>(statement.sql, statement.params);
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
    const commentStatement = selectCommentForDelete(commentId);
    const comment = await queryOneOn<DeleteCommentRow>(
      conn,
      commentStatement.sql,
      commentStatement.params,
    );
    if (!comment) {
      throw new HttpError(404, '评论不存在');
    }

    const repliesStatement = selectCommentReplies(commentId);
    const replyRows = await queryOn<{ id: number }>(
      conn,
      repliesStatement.sql,
      repliesStatement.params,
    );
    const ids = [commentId, ...replyRows.map((row) => Number(row.id))];
    const deleteStatement = softDeleteComments(ids);
    await conn.query(deleteStatement.sql, deleteStatement.params);
    await recomputeCommentCount(conn, comment.albumId);
  });

  await logAdminOp(adminId, 'comment.delete', 'comment', commentId, null, ip);
}

export async function getPendingCommentCount(): Promise<number> {
  const statement = countPendingComments();
  const row = await dbClient.queryOne<{ total: number }>(statement.sql, statement.params);
  return Number(row?.total ?? 0);
}
