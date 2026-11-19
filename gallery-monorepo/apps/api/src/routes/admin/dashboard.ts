/**
 * 后台看板接口：概览统计与营收趋势。
 * 均为只读查询，不产生缓存失效与操作日志副作用。
 */
import { createRoute } from '@hono/zod-openapi';

import * as dashboardController from '../../controllers/admin/dashboard.controller.js';
import { AdminDashboardSchema, AdminTrendSchema } from '../../openapi/models/admin.js';
import { errorResponses, successResponse } from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { trendSchema } from '../../validators/admin/system.js';

const router = createApiRouter();

/** GET /api/admin/dashboard —— 概览统计（用户、图集、订单、营收等）。 */
const dashboardRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 看板'],
  summary: '数据看板统计',
  responses: { 200: successResponse(AdminDashboardSchema, '看板数据'), ...errorResponses },
});

/** GET /api/admin/dashboard/trend —— 营收趋势，query.mode 支持 7d/30d/6m。 */
const trendRoute = createRoute({
  method: 'get',
  path: '/trend',
  tags: ['后台 · 看板'],
  summary: '营收趋势',
  request: { query: trendSchema },
  responses: { 200: successResponse(AdminTrendSchema, '趋势数据'), ...errorResponses },
});

router.openapi(dashboardRoute, routeHandler(dashboardRoute, (c) => dashboardController.dashboard(c)));
router.openapi(
  trendRoute,
  routeHandler(trendRoute, (c) => dashboardController.trend(c, c.req.valid('query'))),
);

export default router;
