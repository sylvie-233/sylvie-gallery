import { createRoute, z } from '@hono/zod-openapi';

import * as authorController from '../controllers/author.controller.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { AuthorDetailSchema, AuthorSchema, SubscriptionResultSchema } from '../openapi/models/album.js';
import { errorResponses, idParamsSchema, successResponse } from '../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { authorDetailSchema, authorListSchema } from '../validators/albums.js';

const router = createApiRouter();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['作者'],
  summary: '作者列表',
  description: '支持姓名、别名与风格标签搜索。',
  security: [],
  middleware: [optionalAuth],
  request: { query: authorListSchema },
  responses: { 200: successResponse(z.array(AuthorSchema), '作者列表'), ...errorResponses },
});

const detailRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['作者'],
  summary: '作者详情与其图集',
  security: [],
  middleware: [optionalAuth],
  request: { params: idParamsSchema, query: authorDetailSchema },
  responses: { 200: successResponse(AuthorDetailSchema, '作者详情'), ...errorResponses },
});

const subscribeRoute = createRoute({
  method: 'post',
  path: '/{id}/subscribe',
  tags: ['作者'],
  summary: '切换作者订阅状态',
  middleware: [authenticate],
  request: { params: idParamsSchema },
  responses: { 200: successResponse(SubscriptionResultSchema, '订阅状态'), ...errorResponses },
});

router.openapi(
  listRoute,
  routeHandler(listRoute, (c) => authorController.list(c, c.req.valid('query'))),
);
router.openapi(
  detailRoute,
  routeHandler(detailRoute, (c) =>
    authorController.detail(c, c.req.valid('param').id, c.req.valid('query')),
  ),
);
router.openapi(
  subscribeRoute,
  routeHandler(subscribeRoute, (c) => authorController.subscribe(c, c.req.valid('param').id)),
);

export default router;
