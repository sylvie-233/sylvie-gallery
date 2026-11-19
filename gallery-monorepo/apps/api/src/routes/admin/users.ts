import { createRoute } from '@hono/zod-openapi';

import * as userController from '../../controllers/admin/user.controller.js';
import {
  AdminResetPasswordResultSchema,
  AdminUserPageSchema,
  AdminUserRowSchema,
} from '../../openapi/models/admin.js';
import {
  errorResponses,
  idParamsSchema,
  jsonBody,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { pointsSchema, userListSchema } from '../../validators/admin/commerce.js';

const router = createApiRouter();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 用户'],
  summary: '后台用户列表',
  request: { query: userListSchema },
  responses: { 200: successResponse(AdminUserPageSchema, '用户分页'), ...errorResponses },
});

const pointsRoute = createRoute({
  method: 'post',
  path: '/{id}/points',
  tags: ['后台 · 用户'],
  summary: '调整用户解锁积分',
  request: { params: idParamsSchema, body: jsonBody(pointsSchema) },
  responses: { 200: successResponse(AdminUserRowSchema, '积分已调整'), ...errorResponses },
});

const grantVipRoute = createRoute({
  method: 'post',
  path: '/{id}/grant-vip',
  tags: ['后台 · 用户'],
  summary: '赠送 30 天付费会员',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(AdminUserRowSchema, '会员已赠送'), ...errorResponses },
});

const resetPasswordRoute = createRoute({
  method: 'post',
  path: '/{id}/reset-password',
  tags: ['后台 · 用户'],
  summary: '重置用户密码为默认值',
  request: { params: idParamsSchema },
  responses: {
    200: successResponse(AdminResetPasswordResultSchema, '密码已重置'),
    ...errorResponses,
  },
});

const toggleStatusRoute = createRoute({
  method: 'post',
  path: '/{id}/toggle-status',
  tags: ['后台 · 用户'],
  summary: '封禁 / 解封用户',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(AdminUserRowSchema, '用户状态'), ...errorResponses },
});

router.openapi(
  listRoute,
  routeHandler(listRoute, (c) => userController.list(c, c.req.valid('query'))),
);
router.openapi(
  pointsRoute,
  routeHandler(pointsRoute, (c) =>
    userController.adjustPoints(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);
router.openapi(
  grantVipRoute,
  routeHandler(grantVipRoute, (c) => userController.grantVip(c, c.req.valid('param').id)),
);
router.openapi(
  resetPasswordRoute,
  routeHandler(resetPasswordRoute, (c) =>
    userController.resetPassword(c, c.req.valid('param').id),
  ),
);
router.openapi(
  toggleStatusRoute,
  routeHandler(toggleStatusRoute, (c) => userController.toggleStatus(c, c.req.valid('param').id)),
);

export default router;
