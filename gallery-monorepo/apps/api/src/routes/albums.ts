import { createRoute } from '@hono/zod-openapi';

import * as albumController from '../controllers/album.controller.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import {
  AlbumDetailSchema,
  AlbumPageResultSchema,
  CommentSchema,
  FavoriteResultSchema,
  UnlockResultSchema,
} from '../openapi/models/album.js';
import {
  binaryResponse,
  errorResponses,
  idParamsSchema,
  jsonBody,
  successResponse,
} from '../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { albumListSchema, commentSchema } from '../validators/albums.js';

const router = createApiRouter();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['图集'],
  summary: '图集列表',
  description: '支持最新 / 热门 / 收藏排序、标签筛选、关键词检索与作者筛选。',
  security: [],
  middleware: [optionalAuth],
  request: { query: albumListSchema },
  responses: { 200: successResponse(AlbumPageResultSchema, '图集分页列表'), ...errorResponses },
});

const detailRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['图集'],
  summary: '图集详情',
  description: '未解锁时仅返回前 3 张预览；付费会员与已解锁用户返回全部媒体。',
  security: [],
  middleware: [optionalAuth],
  request: { params: idParamsSchema },
  responses: { 200: successResponse(AlbumDetailSchema, '图集详情'), ...errorResponses },
});

const commentRoute = createRoute({
  method: 'post',
  path: '/{id}/comments',
  tags: ['图集'],
  summary: '发表评论',
  description: '先审后发，审核通过后展示。',
  middleware: [authenticate],
  request: { params: idParamsSchema, body: jsonBody(commentSchema) },
  responses: {
    201: successResponse(CommentSchema, '评论已提交，审核通过后展示'),
    ...errorResponses,
  },
});

const favoriteRoute = createRoute({
  method: 'post',
  path: '/{id}/favorite',
  tags: ['图集'],
  summary: '切换图集收藏状态',
  middleware: [authenticate],
  request: { params: idParamsSchema },
  responses: { 200: successResponse(FavoriteResultSchema, '收藏状态'), ...errorResponses },
});

const unlockRoute = createRoute({
  method: 'post',
  path: '/{id}/unlock',
  tags: ['图集'],
  summary: '消耗解锁积分永久解锁图集',
  middleware: [authenticate],
  request: { params: idParamsSchema },
  responses: { 200: successResponse(UnlockResultSchema, '解锁结果'), ...errorResponses },
});

const downloadRoute = createRoute({
  method: 'get',
  path: '/{id}/download',
  tags: ['图集'],
  summary: '打包下载原图 ZIP',
  description: '需已解锁或付费会员；下载不扣积分。',
  middleware: [authenticate],
  request: { params: idParamsSchema },
  responses: { 200: binaryResponse('application/zip', 'ZIP 文件流'), ...errorResponses },
});

router.openapi(
  listRoute,
  routeHandler(listRoute, (c) => albumController.list(c, c.req.valid('query'))),
);
router.openapi(
  detailRoute,
  routeHandler(detailRoute, (c) => albumController.detail(c, c.req.valid('param').id)),
);
router.openapi(
  commentRoute,
  routeHandler(commentRoute, (c) =>
    albumController.comment(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);
router.openapi(
  favoriteRoute,
  routeHandler(favoriteRoute, (c) => albumController.favorite(c, c.req.valid('param').id)),
);
router.openapi(
  unlockRoute,
  routeHandler(unlockRoute, (c) => albumController.unlock(c, c.req.valid('param').id)),
);
router.openapi(
  downloadRoute,
  routeHandler(downloadRoute, (c) => albumController.download(c, c.req.valid('param').id)),
);

export default router;
