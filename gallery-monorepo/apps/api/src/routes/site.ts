/**
 * 站点接口：前台初始化聚合数据与站点配置键值对。
 * 两者都是匿名可访问的只读数据，服务端做短时缓存。
 */
import { createRoute, z } from '@hono/zod-openapi';

import * as siteController from '../controllers/site.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { errorResponses, successResponse } from '../openapi/models/common.js';
import { SiteBootstrapSchema } from '../openapi/models/content.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';

const router = createApiRouter();

// 站点配置以 sys_config 的键值对直接透出，全部为字符串，由前端按约定解析。
const configMapSchema = z.record(z.string(), z.string()).openapi('SiteConfigMap');

/**
 * GET /api/site/bootstrap —— 前台初始化聚合数据。
 * 鉴权：optionalAuth；一次返回配置、友链、套餐、标签、作者、最新图集与公告，减少首屏请求数。
 * 缓存：按 userId（游客为 guest）区分，登录用户的作者订阅状态不会被串用。
 */
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

/**
 * GET /api/site/config —— 站点配置键值对（版权、备案号、签到积分、水印开关等）。
 * 鉴权：无；响应为 `Record<string, string>`。
 */
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
