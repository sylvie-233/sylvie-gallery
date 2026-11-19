/**
 * 后台配置接口：站点配置、会员套餐与友情链接的读取与保存。
 * 聚合 GET 一次返回三类配置；写操作按影响范围失效站点/订单缓存。
 */
import { createRoute } from '@hono/zod-openapi';

import * as configController from '../../controllers/admin/config.controller.js';
import {
  AdminConfigBundleSchema,
  AdminFriendLinkRowSchema,
} from '../../openapi/models/admin.js';
import {
  errorResponses,
  idParamsSchema,
  jsonBody,
  nullSchema,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import {
  friendLinkSchema,
  planConfigSchema,
  siteConfigSchema,
} from '../../validators/admin/commerce.js';

const router = createApiRouter();

/** GET /api/admin/config —— 聚合返回站点配置、会员套餐与友情链接。 */
const bundleRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 配置'],
  summary: '获取站点配置、会员套餐与友情链接',
  responses: { 200: successResponse(AdminConfigBundleSchema, '配置聚合'), ...errorResponses },
});

/** PUT /api/admin/config/site —— 保存版权、ICP、签到积分与水印开关等站点配置。 */
const siteRoute = createRoute({
  method: 'put',
  path: '/site',
  tags: ['后台 · 配置'],
  summary: '保存站点配置',
  request: { body: jsonBody(siteConfigSchema) },
  responses: { 200: successResponse(AdminConfigBundleSchema, '站点配置已保存'), ...errorResponses },
});

/** PUT /api/admin/config/plan —— 保存会员套餐（价格、时长天数与权益列表）。 */
const planRoute = createRoute({
  method: 'put',
  path: '/plan',
  tags: ['后台 · 配置'],
  summary: '保存会员套餐',
  request: { body: jsonBody(planConfigSchema) },
  responses: { 200: successResponse(AdminConfigBundleSchema, '会员套餐已保存'), ...errorResponses },
});

/** POST /api/admin/config/friends —— 新增友情链接，body 包含站名、标语与 URL。 */
const createFriendRoute = createRoute({
  method: 'post',
  path: '/friends',
  tags: ['后台 · 配置'],
  summary: '新增友情链接',
  request: { body: jsonBody(friendLinkSchema) },
  responses: { 201: successResponse(AdminFriendLinkRowSchema, '友链已添加'), ...errorResponses },
});

/** DELETE /api/admin/config/friends/{id} —— 删除友情链接。 */
const deleteFriendRoute = createRoute({
  method: 'delete',
  path: '/friends/{id}',
  tags: ['后台 · 配置'],
  summary: '删除友情链接',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(nullSchema, '友链已删除'), ...errorResponses },
});

router.openapi(bundleRoute, routeHandler(bundleRoute, (c) => configController.bundle(c)));
router.openapi(
  siteRoute,
  routeHandler(siteRoute, (c) => configController.updateSite(c, c.req.valid('json'))),
);
router.openapi(
  planRoute,
  routeHandler(planRoute, (c) => configController.updatePlan(c, c.req.valid('json'))),
);
router.openapi(
  createFriendRoute,
  routeHandler(createFriendRoute, (c) => configController.createFriend(c, c.req.valid('json'))),
);
router.openapi(
  deleteFriendRoute,
  routeHandler(deleteFriendRoute, (c) =>
    configController.deleteFriend(c, c.req.valid('param').id),
  ),
);

export default router;
