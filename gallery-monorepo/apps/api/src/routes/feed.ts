/**
 * 前台推荐流接口：首页瀑布流「个人推荐」。
 * 登录用户按浏览 / 收藏偏好排序，游客退化为推荐池 + 最新内容；响应结构与图集分页一致。
 */
import { createRoute } from '@hono/zod-openapi';

import * as albumController from '../controllers/album.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { AlbumPageResultSchema } from '../openapi/models/album.js';
import { errorResponses, successResponse } from '../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { feedQuerySchema } from '../validators/albums.js';

const router = createApiRouter();

/**
 * GET /api/feed —— 推荐图集分页。
 * 鉴权：optionalAuth；query 经 feedQuerySchema（page 默认 1，pageSize 默认 24、上限 36）。
 * 响应：AlbumPageResult，卡片附带当前用户的收藏状态。
 */
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
