import { createRoute } from '@hono/zod-openapi';

import * as albumController from '../controllers/album.controller.js';
import * as authorController from '../controllers/author.controller.js';
import { authenticate } from '../middleware/auth.js';
import { AlbumPageResultSchema, AuthorPageResultSchema } from '../openapi/models/album.js';
import { errorResponses, successResponse } from '../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { pageQuerySchema } from '../validators/albums.js';

const router = createApiRouter();

const favoritesRoute = createRoute({
  method: 'get',
  path: '/favorites',
  tags: ['个人中心'],
  summary: '我的收藏图集',
  middleware: [authenticate],
  request: { query: pageQuerySchema },
  responses: {
    200: successResponse(AlbumPageResultSchema, '收藏图集分页'),
    ...errorResponses,
  },
});

const subscriptionsRoute = createRoute({
  method: 'get',
  path: '/subscriptions',
  tags: ['个人中心'],
  summary: '我订阅的作者',
  middleware: [authenticate],
  request: { query: pageQuerySchema },
  responses: {
    200: successResponse(AuthorPageResultSchema, '订阅作者分页'),
    ...errorResponses,
  },
});

router.openapi(
  favoritesRoute,
  routeHandler(favoritesRoute, (c) => albumController.favorites(c, c.req.valid('query'))),
);
router.openapi(
  subscriptionsRoute,
  routeHandler(subscriptionsRoute, (c) =>
    authorController.subscriptions(c, c.req.valid('query')),
  ),
);

export default router;
