/**
 * 后台评论控制器：列表、审核与删除。
 * 评论状态与数量变化会影响图集详情和站点聚合，写操作后统一失效缓存。
 */
import { invalidateCache } from '../../cache/index.js';
import {
  deleteAdminComment,
  getAdminComments,
  reviewAdminComment,
} from '../../services/admin/comment-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { CommentListInput, CommentReviewInput } from '../../validators/admin/content.js';
import { adminOperator } from './helpers.js';

/** GET /api/admin/comments —— 参数来自 query，按审核状态、关键词与日期分页查询。 */
export async function list(c: AppContext, query: CommentListInput): Promise<Response> {
  return success(c, await getAdminComments(query));
}

/** POST /api/admin/comments/:id/review —— 入参 status 仅 approved/rejected，审核后同步图集评论数。 */
export async function review(
  c: AppContext,
  id: number,
  input: CommentReviewInput,
): Promise<Response> {
  const operator = adminOperator(c);
  const result = await reviewAdminComment(operator.adminId, id, input.status, operator.ip);
  await invalidateCache('albums', 'site');
  return success(c, result, input.status === 'approved' ? '评论已通过' : '评论已拒绝');
}

/** DELETE /api/admin/comments/:id —— 删除后图集 comment_count 由 service 在同一操作中扣减。 */
export async function remove(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAdminComment(operator.adminId, id, operator.ip);
  await invalidateCache('albums', 'site');
  return success(c, null, '评论已删除');
}
