import { createRoute } from '@hono/zod-openapi';

import * as adminAuthController from '../../controllers/admin/auth.controller.js';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { errorResponses, jsonBody, successResponse } from '../../openapi/models/common.js';
import { AuthResultSchema, UserProfileSchema } from '../../openapi/models/user.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { adminLoginSchema } from '../../validators/admin/auth.js';

const router = createApiRouter();

const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  tags: ['后台 · 认证'],
  summary: '管理后台登录',
  description: '仅 admin 角色可登录；演示账号可输入简写 admin。',
  security: [],
  request: { body: jsonBody(adminLoginSchema) },
  responses: { 200: successResponse(AuthResultSchema, '登录成功'), ...errorResponses },
});

const meRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['后台 · 认证'],
  summary: '获取当前管理员资料',
  middleware: [authenticate, requireAdmin],
  responses: { 200: successResponse(UserProfileSchema, '管理员资料'), ...errorResponses },
});

router.openapi(
  loginRoute,
  routeHandler(loginRoute, (c) => adminAuthController.loginAdmin(c, c.req.valid('json'))),
);
router.openapi(meRoute, routeHandler(meRoute, (c) => adminAuthController.me(c)));

export default router;
