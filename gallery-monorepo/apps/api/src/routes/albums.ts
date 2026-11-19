/**
 * 前台图集接口：列表 / 详情、发表评论、收藏切换、积分解锁与 ZIP 打包下载。
 * 列表与详情对游客开放（optionalAuth），评论 / 收藏 / 解锁 / 下载需要登录 JWT 并按接口限流。
 */
import { createRoute } from '@hono/zod-openapi';

import * as albumController from '../controllers/album.controller.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { commentLimit, downloadLimit, unlockLimit } from '../middleware/rate-limit.js';
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

/**
 * GET /api/albums —— 图集分页列表。
 * 鉴权：optionalAuth，游客可访问；携带 JWT 时卡片附带收藏状态。
 * 校验：query 经 albumListSchema（页码、每页 ≤48、new/hot/fav 排序、标签、关键词、作者）。
 */
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

/**
 * GET /api/albums/{id} —— 图集详情。
 * 鉴权：optionalAuth；未解锁仅返回前 3 张预览（水印图），已解锁或付费会员返回全部原图。
 * 校验：路径 id 为正整数；不存在或已下架时走通用错误响应。
 */
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

/**
 * POST /api/albums/{id}/comments —— 发表评论。
 * 鉴权：authenticate + commentLimit（按用户限流）。
 * 校验：id 路径参数与 commentSchema 请求体（1-500 字，可选父评论与回复对象）。
 * 语义：先审后发，固定返回 201，评论状态为 pending，审核通过后才在前台展示。
 */
const commentRoute = createRoute({
  method: 'post',
  path: '/{id}/comments',
  tags: ['图集'],
  summary: '发表评论',
  description: '先审后发，审核通过后展示。',
  middleware: [authenticate, commentLimit],
  request: { params: idParamsSchema, body: jsonBody(commentSchema) },
  responses: {
    201: successResponse(CommentSchema, '评论已提交，审核通过后展示'),
    ...errorResponses,
  },
});

/**
 * POST /api/albums/{id}/favorite —— 切换收藏状态（收藏 / 取消收藏）。
 * 鉴权：authenticate；副作用是同步维护 album.fav_count 冗余计数。
 */
const favoriteRoute = createRoute({
  method: 'post',
  path: '/{id}/favorite',
  tags: ['图集'],
  summary: '切换图集收藏状态',
  middleware: [authenticate],
  request: { params: idParamsSchema },
  responses: { 200: successResponse(FavoriteResultSchema, '收藏状态'), ...errorResponses },
});

/**
 * POST /api/albums/{id}/unlock —— 消耗「解锁积分」永久解锁图集。
 * 鉴权：authenticate + unlockLimit；付费会员或已解锁时返回 already=true 且不重复扣分。
 * 副作用：扣减 user.points 并写解锁记录，积分不得为负。
 */
const unlockRoute = createRoute({
  method: 'post',
  path: '/{id}/unlock',
  tags: ['图集'],
  summary: '消耗解锁积分永久解锁图集',
  middleware: [authenticate, unlockLimit],
  request: { params: idParamsSchema },
  responses: { 200: successResponse(UnlockResultSchema, '解锁结果'), ...errorResponses },
});

/**
 * GET /api/albums/{id}/download —— 打包下载原图与视频 ZIP。
 * 鉴权：authenticate + downloadLimit；需已解锁或付费会员，下载不扣积分。
 * 响应：流式 ZIP，Content-Disposition 使用 RFC 5987 的 filename* 传递中文文件名。
 */
const downloadRoute = createRoute({
  method: 'get',
  path: '/{id}/download',
  tags: ['图集'],
  summary: '打包下载原图与视频 ZIP',
  description: '需已解锁或付费会员；下载不扣积分。',
  middleware: [authenticate, downloadLimit],
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
