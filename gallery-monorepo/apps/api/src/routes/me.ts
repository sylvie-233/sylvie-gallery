/**
 * 个人中心接口：我的收藏图集与已订阅作者的分页列表。
 * 两个接口都需要登录，且只返回当前 JWT 用户自己的数据。
 */
import { createRoute } from '@hono/zod-openapi';

import * as albumController from '../controllers/album.controller.js';
import * as authorController from '../controllers/author.controller.js';
import { authenticate } from '../middleware/auth.js';
import { AlbumPageResultSchema, AuthorPageResultSchema } from '../openapi/models/album.js';
import { errorResponses, successResponse } from '../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { pageQuerySchema } from '../validators/albums.js';

const router = createApiRouter();

/**
 * GET /api/me/favorites —— 我的收藏图集。
 * 鉴权：authenticate；query 经 pageQuerySchema（pageSize ≤36）。
 * 响应：AlbumPageResult，按收藏时间倒序。
 */
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

/**
 * GET /api/me/subscriptions —— 我订阅的作者。
 * 鉴权：authenticate；query 经 pageQuerySchema；响应 AuthorPageResult。
 */
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
