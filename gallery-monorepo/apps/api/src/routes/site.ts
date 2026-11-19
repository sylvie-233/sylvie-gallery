import { createRoute, z } from '@hono/zod-openapi';

import * as siteController from '../controllers/site.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { errorResponses, successResponse } from '../openapi/models/common.js';
import { SiteBootstrapSchema } from '../openapi/models/content.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';

const router = createApiRouter();

const configMapSchema = z.record(z.string(), z.string()).openapi('SiteConfigMap');

const bootstrapRoute = createRoute({
  method: 'get',
  path: '/bootstrap',
  tags: ['站点'],
  summary: '获取前台初始化数据',
  description: '包含站点配置、友链、会员套餐、标签、作者、最新图集与公告。',
  security: [],
  middleware: [optionalAuth],
  responses: { 200: successResponse(SiteBootstrapSchema, '前台初始化数据'), ...errorResponses },
});

const configRoute = createRoute({
  method: 'get',
  path: '/config',
  tags: ['站点'],
  summary: '获取站点配置键值对',
  security: [],
  responses: { 200: successResponse(configMapSchema, '站点配置'), ...errorResponses },
});

router.openapi(bootstrapRoute, routeHandler(bootstrapRoute, (c) => siteController.bootstrap(c)));
router.openapi(configRoute, routeHandler(configRoute, (c) => siteController.config(c)));

export default router;
