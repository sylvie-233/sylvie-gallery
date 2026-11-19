/**
 * 后台评论接口：列表、审核（通过/拒绝）与删除。
 * 评论变更会影响图集评论数与站点聚合缓存，写操作后统一失效。
 */
import { createRoute } from '@hono/zod-openapi';

import * as commentController from '../../controllers/admin/comment.controller.js';
import { AdminCommentPageSchema, AdminCommentRowSchema } from '../../openapi/models/admin.js';
import {
  errorResponses,
  idParamsSchema,
  jsonBody,
  nullSchema,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { commentListSchema, commentReviewSchema } from '../../validators/admin/content.js';

const router = createApiRouter();

/** GET /api/admin/comments —— 评论分页，支持审核状态、关键词与日期筛选。 */
const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 评论'],
  summary: '后台评论列表',
  request: { query: commentListSchema },
  responses: { 200: successResponse(AdminCommentPageSchema, '评论分页'), ...errorResponses },
});

/** POST /api/admin/comments/{id}/review —— body 仅接受 approved/rejected。 */
const reviewRoute = createRoute({
  method: 'post',
  path: '/{id}/review',
  tags: ['后台 · 评论'],
  summary: '审核通过 / 拒绝评论',
  request: { params: idParamsSchema, body: jsonBody(commentReviewSchema) },
  responses: { 200: successResponse(AdminCommentRowSchema, '评论审核结果'), ...errorResponses },
});

/** DELETE /api/admin/comments/{id} —— 删除评论并同步图集评论数。 */
const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['后台 · 评论'],
  summary: '删除评论',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(nullSchema, '评论已删除'), ...errorResponses },
});

router.openapi(
  listRoute,
  routeHandler(listRoute, (c) => commentController.list(c, c.req.valid('query'))),
);
router.openapi(
  reviewRoute,
  routeHandler(reviewRoute, (c) =>
    commentController.review(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);
router.openapi(
  deleteRoute,
  routeHandler(deleteRoute, (c) => commentController.remove(c, c.req.valid('param').id)),
);

export default router;
