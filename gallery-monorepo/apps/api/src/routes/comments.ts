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
