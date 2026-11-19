/**
 * 前台作者接口：作者列表 / 详情与其图集分页、订阅切换。
 * 列表与详情允许游客访问（optionalAuth），订阅需要登录；登录用户返回 subscribed 状态。
 */
import { createRoute, z } from '@hono/zod-openapi';

import * as authorController from '../controllers/author.controller.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { AuthorDetailSchema, AuthorSchema, SubscriptionResultSchema } from '../openapi/models/album.js';
import { errorResponses, idParamsSchema, successResponse } from '../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { authorDetailSchema, authorListSchema } from '../validators/albums.js';

const router = createApiRouter();

/**
 * GET /api/authors —— 作者列表（不分页）。
 * 鉴权：optionalAuth；query 仅支持 keyword（姓名 / 别名 / 风格标签，≤32 字）。
 * 响应：按 sort_weight 与更新时间排序的完整作者数组。
 */
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

/**
 * GET /api/authors/{id} —— 作者详情 + 其图集分页。
 * 鉴权：optionalAuth；query 校验页码与每页条数（≤36）。
 * 响应：作者本体、图集分页字段与订阅状态。
 */
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

/**
 * POST /api/authors/{id}/subscribe —— 切换作者订阅（订阅 / 取消订阅）。
 * 鉴权：authenticate；副作用是新增或删除 author_subscription 记录。
 */
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
