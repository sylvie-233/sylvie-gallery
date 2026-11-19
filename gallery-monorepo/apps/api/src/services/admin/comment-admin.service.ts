/**
 * 后台评论管理：分页列表、审核（通过 / 拒绝）、删除与待审数量统计。
 *
 * 审核与删除都在事务中用 FOR UPDATE 锁住目标评论，并在同一事务内重算
 * album.comment_count（仅统计 approved 且未删除的评论），随后写入用户通知。
 */
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

/** 将评论行映射为 DTO，附带图集标题、被回复人昵称与用户头像信息。 */
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

/**
 * 分页查询评论列表。
 *
 * @param query.status approved / rejected / pending；非法值（含未传）回退为 pending，优先展示待审
 * @param query.keyword 模糊匹配用户昵称、评论内容、图集标题
 * @param query.from / query.to 按评论创建日期区间过滤
 * @param query.page / query.pageSize 未传默认每页 5 条
 * 仅返回未软删除评论，按创建时间倒序。
 */
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

/** 在事务连接上按底层评论重算 album.comment_count 冗余字段。 */
async function recomputeCommentCount(
  conn: TransactionConnection,
  albumId: number,
): Promise<void> {
  const statement = recomputeAlbumCommentCount(albumId);
  await conn.query(statement.sql, statement.params);
}

/**
 * 审核评论：approved / rejected。
 *
 * 事务内先用 FOR UPDATE 读取评论（避免并发审核覆盖），已删除评论不可审核；
 * 更新状态后重算图集评论数，并写入一条类型为 review 的站内通知。
 * 事务提交后记录 comment.review 操作日志，返回最新评论。
 */
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

/** 读取单条评论详情；不存在或已删除时抛 404。 */
async function getAdminComment(commentId: number): Promise<AdminCommentRow> {
  const statement = selectAdminCommentById(commentId);
  const row = await dbClient.queryOne<CommentRow>(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '评论不存在');
  }
  return mapComment(row);
}

/**
 * 软删除评论及其直接回复。
 *
 * 事务内 FOR UPDATE 锁住评论，查出所有 parent_id 指向它的未删除回复，
 * 一并置 status = 'deleted'、is_deleted = 1，然后重算图集评论数。
 * 不做物理删除；操作提交后记录 comment.delete 日志。
 */
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

/** 统计待审核评论总数，供后台角标 / 看板待办使用。 */
export async function getPendingCommentCount(): Promise<number> {
  const statement = countPendingComments();
  const row = await dbClient.queryOne<{ total: number }>(statement.sql, statement.params);
  return Number(row?.total ?? 0);
}
