import { createRoute } from '@hono/zod-openapi';

import * as logController from '../../controllers/admin/log.controller.js';
import { AdminLogPageSchema } from '../../openapi/models/admin.js';
import { errorResponses, successResponse } from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { logListSchema } from '../../validators/admin/system.js';

const router = createApiRouter();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 日志'],
  summary: '管理操作日志',
  request: { query: logListSchema },
  responses: { 200: successResponse(AdminLogPageSchema, '操作日志分页'), ...errorResponses },
});

router.openapi(
  listRoute,
  routeHandler(listRoute, (c) => logController.list(c, c.req.valid('query'))),
);

export default router;
