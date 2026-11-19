import { createRoute } from '@hono/zod-openapi';

import { authenticate } from '../middleware/auth.js';
import {
  loginAccountLimit,
  loginIpLimit,
  registerIpLimit,
  sendCodeEmailLimit,
  sendCodeIpLimit,
} from '../middleware/rate-limit.js';
import * as authController from '../controllers/auth.controller.js';
import { errorResponses, jsonBody, successResponse } from '../openapi/models/common.js';
import {
  AuthResultSchema,
  CheckinResultSchema,
  CheckinStatusSchema,
  SendCodeResultSchema,
  UserProfileSchema,
} from '../openapi/models/user.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import {
  avatarBodySchema,
  loginSchema,
  profileSchema,
  registerSchema,
  sendCodeSchema,
} from '../validators/auth.js';

const router = createApiRouter();

const sendCodeRoute = createRoute({
  method: 'post',
  path: '/send-code',
  tags: ['认证'],
  summary: '发送邮箱验证码',
  description: '注册或找回密码时发送 6 位验证码；开发环境返回固定验证码。',
  security: [],
  middleware: [sendCodeIpLimit, sendCodeEmailLimit],
  request: { body: jsonBody(sendCodeSchema) },
  responses: { 200: successResponse(SendCodeResultSchema, '验证码已发送'), ...errorResponses },
});

const registerRoute = createRoute({
  method: 'post',
  path: '/register',
  tags: ['认证'],
  summary: '注册会员账号',
  security: [],
  middleware: [registerIpLimit],
  request: { body: jsonBody(registerSchema) },
  responses: { 201: successResponse(AuthResultSchema, '注册成功'), ...errorResponses },
});

const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  tags: ['认证'],
  summary: '登录并签发 JWT',
  security: [],
  middleware: [loginIpLimit, loginAccountLimit],
  request: { body: jsonBody(loginSchema) },
  responses: { 200: successResponse(AuthResultSchema, '登录成功'), ...errorResponses },
});

const meRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['认证'],
  summary: '获取当前用户资料',
  middleware: [authenticate],
  responses: { 200: successResponse(UserProfileSchema, '当前用户资料'), ...errorResponses },
});

const updateProfileRoute = createRoute({
  method: 'patch',
  path: '/profile',
  tags: ['认证'],
  summary: '更新昵称与预设头像',
  middleware: [authenticate],
  request: { body: jsonBody(profileSchema) },
  responses: { 200: successResponse(UserProfileSchema, '资料已更新'), ...errorResponses },
});

const avatarRoute = createRoute({
  method: 'post',
  path: '/avatar',
  tags: ['认证'],
  summary: '上传自定义头像',
  description: '≤2MB，支持 jpg / png / webp。',
  middleware: [authenticate],
  request: {
    body: {
      content: { 'multipart/form-data': { schema: avatarBodySchema } },
      required: true,
    },
  },
  responses: { 200: successResponse(UserProfileSchema, '头像已更新'), ...errorResponses },
});

const checkinStatusRoute = createRoute({
  method: 'get',
  path: '/checkin',
  tags: ['认证'],
  summary: '查询今日签到状态',
  middleware: [authenticate],
  responses: { 200: successResponse(CheckinStatusSchema, '签到状态'), ...errorResponses },
});

const checkinRoute = createRoute({
  method: 'post',
  path: '/checkin',
  tags: ['认证'],
  summary: '每日签到领取解锁积分',
  middleware: [authenticate],
  responses: { 200: successResponse(CheckinResultSchema, '签到结果'), ...errorResponses },
});

router.openapi(
  sendCodeRoute,
  routeHandler(sendCodeRoute, (c) => authController.sendCode(c, c.req.valid('json'))),
);
router.openapi(
  registerRoute,
  routeHandler(registerRoute, (c) => authController.registerUser(c, c.req.valid('json'))),
);
router.openapi(
  loginRoute,
  routeHandler(loginRoute, (c) => authController.loginUser(c, c.req.valid('json'))),
);
router.openapi(meRoute, routeHandler(meRoute, (c) => authController.me(c)));
router.openapi(
  updateProfileRoute,
  routeHandler(updateProfileRoute, (c) => authController.updateMyProfile(c, c.req.valid('json'))),
);
router.openapi(avatarRoute, routeHandler(avatarRoute, (c) => authController.uploadAvatar(c)));
router.openapi(
  checkinStatusRoute,
  routeHandler(checkinStatusRoute, (c) => authController.checkinStatus(c)),
);
router.openapi(checkinRoute, routeHandler(checkinRoute, (c) => authController.checkinToday(c)));

export default router;
