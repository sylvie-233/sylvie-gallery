/**
 * 前台通知接口：我的通知分页（附未读数）、单条已读与全部已读。
 * 全部接口需要登录，数据范围限定为当前用户，不能操作他人通知。
 */
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

/**
 * GET /api/notifications —— 我的通知分页。
 * 鉴权：authenticate；query 校验 filter=all/unread 与每页 ≤24。
 * 响应：分页列表 + `unread` 未读总数，前端可直接用于红点徽标。
 */
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

/**
 * POST /api/notifications/{id}/read —— 标记单条通知为已读。
 * 鉴权：authenticate；服务层校验通知归属，已读操作幂等。
 */
const readRoute = createRoute({
  method: 'post',
  path: '/{id}/read',
  tags: ['通知'],
  summary: '标记单条通知为已读',
  middleware: [authenticate],
  request: { params: idParamsSchema },
  responses: { 200: successResponse(nullSchema, '已标记为已读'), ...errorResponses },
});

/**
 * POST /api/notifications/read-all —— 将当前用户全部未读通知标记为已读。
 * 鉴权：authenticate；无请求体，重复调用无副作用。
 */
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
