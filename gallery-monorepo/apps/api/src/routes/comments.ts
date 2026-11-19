/**
 * 前台评论接口：目前仅保留「删除本人评论」。
 * 评论创建位于 POST /api/albums/{id}/comments（图集路由），共用 album.controller。
 */
import { createRoute } from '@hono/zod-openapi';

import * as albumController from '../controllers/album.controller.js';
import { authenticate } from '../middleware/auth.js';
import {
  errorResponses,
  idParamsSchema,
  nullSchema,
  successResponse,
} from '../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';

const router = createApiRouter();

/**
 * DELETE /api/comments/{id} —— 删除本人评论。
 * 鉴权：authenticate；服务层校验评论归属，非本人返回 403。
 * 副作用：软删除（status=deleted）并同步扣减 album.comment_count。
 */
const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['图集'],
  summary: '删除本人评论',
  middleware: [authenticate],
  request: { params: idParamsSchema },
  responses: { 200: successResponse(nullSchema, '评论已删除'), ...errorResponses },
});

router.openapi(
  deleteRoute,
  routeHandler(deleteRoute, (c) => albumController.removeComment(c, c.req.valid('param').id)),
);

export default router;
