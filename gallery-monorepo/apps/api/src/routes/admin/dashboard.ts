import { createRoute } from '@hono/zod-openapi';

import * as dashboardController from '../../controllers/admin/dashboard.controller.js';
import { AdminDashboardSchema, AdminTrendSchema } from '../../openapi/models/admin.js';
import { errorResponses, successResponse } from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { trendSchema } from '../../validators/admin/system.js';

const router = createApiRouter();

const dashboardRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 看板'],
  summary: '数据看板统计',
  responses: { 200: successResponse(AdminDashboardSchema, '看板数据'), ...errorResponses },
});

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
