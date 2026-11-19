/**
 * 后台操作日志接口：只读分页查询 admin_op_log。
 * 支持动作、关键词与日期范围筛选。
 */
import { createRoute } from '@hono/zod-openapi';

import * as logController from '../../controllers/admin/log.controller.js';
import { AdminLogPageSchema } from '../../openapi/models/admin.js';
import { errorResponses, successResponse } from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { logListSchema } from '../../validators/admin/system.js';

const router = createApiRouter();

/** GET /api/admin/logs —— 管理操作日志分页，仅读，不做任何写入。 */
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
