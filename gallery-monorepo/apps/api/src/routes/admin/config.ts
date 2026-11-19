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

const bundleRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 配置'],
  summary: '获取站点配置、会员套餐与友情链接',
  responses: { 200: successResponse(AdminConfigBundleSchema, '配置聚合'), ...errorResponses },
});

const siteRoute = createRoute({
  method: 'put',
  path: '/site',
  tags: ['后台 · 配置'],
  summary: '保存站点配置',
  request: { body: jsonBody(siteConfigSchema) },
  responses: { 200: successResponse(AdminConfigBundleSchema, '站点配置已保存'), ...errorResponses },
});

const planRoute = createRoute({
  method: 'put',
  path: '/plan',
  tags: ['后台 · 配置'],
  summary: '保存会员套餐',
  request: { body: jsonBody(planConfigSchema) },
  responses: { 200: successResponse(AdminConfigBundleSchema, '会员套餐已保存'), ...errorResponses },
});

const createFriendRoute = createRoute({
  method: 'post',
  path: '/friends',
  tags: ['后台 · 配置'],
  summary: '新增友情链接',
  request: { body: jsonBody(friendLinkSchema) },
  responses: { 201: successResponse(AdminFriendLinkRowSchema, '友链已添加'), ...errorResponses },
});

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
