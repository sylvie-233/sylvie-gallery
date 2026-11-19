import {
  deleteAdminComment,
  getAdminComments,
  reviewAdminComment,
} from '../../services/admin/comment-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { CommentListInput, CommentReviewInput } from '../../validators/admin/content.js';
import { adminOperator } from './helpers.js';

/** GET /api/admin/comments */
export async function list(c: AppContext, query: CommentListInput): Promise<Response> {
  return success(c, await getAdminComments(query));
}

/** POST /api/admin/comments/:id/review */
export async function review(
  c: AppContext,
  id: number,
  input: CommentReviewInput,
): Promise<Response> {
  const operator = adminOperator(c);
  const result = await reviewAdminComment(operator.adminId, id, input.status, operator.ip);
  return success(c, result, input.status === 'approved' ? '评论已通过' : '评论已拒绝');
}

/** DELETE /api/admin/comments/:id */
export async function remove(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAdminComment(operator.adminId, id, operator.ip);
  return success(c, null, '评论已删除');
}
