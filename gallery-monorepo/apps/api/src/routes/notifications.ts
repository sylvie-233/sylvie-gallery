import { createRoute } from '@hono/zod-openapi';

import * as notificationController from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.js';
import {
  errorResponses,
  idParamsSchema,
  nullSchema,
  successResponse,
} from '../openapi/models/common.js';
import { NotificationPageResultSchema } from '../openapi/models/content.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { notificationQuerySchema } from '../validators/misc.js';

const router = createApiRouter();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['通知'],
  summary: '我的通知',
  description: '返回分页列表与未读数，可用于红点提示。',
  middleware: [authenticate],
  request: { query: notificationQuerySchema },
  responses: {
    200: successResponse(NotificationPageResultSchema, '通知分页列表'),
    ...errorResponses,
  },
});

const readRoute = createRoute({
  method: 'post',
  path: '/{id}/read',
  tags: ['通知'],
  summary: '标记单条通知为已读',
  middleware: [authenticate],
  request: { params: idParamsSchema },
  responses: { 200: successResponse(nullSchema, '已标记为已读'), ...errorResponses },
});

const readAllRoute = createRoute({
  method: 'post',
  path: '/read-all',
  tags: ['通知'],
  summary: '全部通知标记为已读',
  middleware: [authenticate],
  responses: { 200: successResponse(nullSchema, '全部通知已标记为已读'), ...errorResponses },
});

router.openapi(
  listRoute,
  routeHandler(listRoute, (c) => notificationController.list(c, c.req.valid('query'))),
);
router.openapi(
  readRoute,
  routeHandler(readRoute, (c) => notificationController.read(c, c.req.valid('param').id)),
);
router.openapi(readAllRoute, routeHandler(readAllRoute, (c) => notificationController.readAll(c)));

export default router;
