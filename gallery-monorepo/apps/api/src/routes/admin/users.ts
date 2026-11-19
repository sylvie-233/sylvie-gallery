/**
 * 后台用户接口：列表、积分调整、赠送会员、重置密码与封禁/解封。
 * 写操作均记录管理日志；赠送会员会登记到期通知任务。
 */
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

/** GET /api/admin/users —— 用户分页，支持角色、状态与关键词筛选。 */
const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 用户'],
  summary: '后台用户列表',
  request: { query: userListSchema },
  responses: { 200: successResponse(AdminUserPageSchema, '用户分页'), ...errorResponses },
});

/** POST /api/admin/users/{id}/points —— 调整解锁积分，delta 可正可负，需填写原因。 */
const pointsRoute = createRoute({
  method: 'post',
  path: '/{id}/points',
  tags: ['后台 · 用户'],
  summary: '调整用户解锁积分',
  request: { params: idParamsSchema, body: jsonBody(pointsSchema) },
  responses: { 200: successResponse(AdminUserRowSchema, '积分已调整'), ...errorResponses },
});

/** POST /api/admin/users/{id}/grant-vip —— 赠送 30 天付费会员，无请求体。 */
const grantVipRoute = createRoute({
  method: 'post',
  path: '/{id}/grant-vip',
  tags: ['后台 · 用户'],
  summary: '赠送 30 天付费会员',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(AdminUserRowSchema, '会员已赠送'), ...errorResponses },
});

/** POST /api/admin/users/{id}/reset-password —— 重置为默认密码，返回一次性结果。 */
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

/** POST /api/admin/users/{id}/toggle-status —— 在封禁/解封之间切换，无请求体。 */
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
