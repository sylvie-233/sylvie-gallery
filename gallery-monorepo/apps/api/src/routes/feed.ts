import { createRoute } from '@hono/zod-openapi';

import * as albumController from '../controllers/album.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { AlbumPageResultSchema } from '../openapi/models/album.js';
import { errorResponses, successResponse } from '../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { feedQuerySchema } from '../validators/albums.js';

const router = createApiRouter();

const feedRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['推荐流'],
  summary: '瀑布流「个人推荐」',
  description: '登录后按浏览与收藏偏好推荐，游客按推荐池与最新内容展示。',
  security: [],
  middleware: [optionalAuth],
  request: { query: feedQuerySchema },
  responses: {
    200: successResponse(AlbumPageResultSchema, '推荐图集分页'),
    ...errorResponses,
  },
});

router.openapi(
  feedRoute,
  routeHandler(feedRoute, (c) => albumController.feed(c, c.req.valid('query'))),
);

export default router;
