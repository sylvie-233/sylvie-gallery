/**
 * 前台认证接口：邮箱验证码、注册 / 登录（签发 JWT）、个人资料与头像、每日签到。
 * 游客可调用验证码、注册与登录；其余接口需要 `Authorization: Bearer <JWT>`。
 * 敏感入口分别按 IP 与账号维度限流。
 */
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

/**
 * POST /api/auth/send-code —— 发送 6 位邮箱验证码。
 * 鉴权：无；中间件先按 IP 再按邮箱限流，防止邮件轰炸。
 * 校验：sendCodeSchema（邮箱格式，scene 为 register / reset_password）。
 * 响应：开发环境通过 demoCode 返回固定验证码，生产环境只返回发送状态与有效期。
 */
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

/**
 * POST /api/auth/register —— 注册会员账号。
 * 鉴权：无（按 IP 限流）；校验 registerSchema：昵称 ≤16 字、密码 6-64 位、邮箱验证码。
 * 响应：201，直接签发 JWT 并返回资料，免去注册后二次登录。
 */
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

/**
 * POST /api/auth/login —— 邮箱密码登录并签发 JWT。
 * 鉴权：无；同时按 IP 与账号限流，避免撞库。
 * 响应：AuthResult（token、有效期秒数与用户资料）。
 */
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

/**
 * GET /api/auth/me —— 获取当前登录用户资料。
 * 鉴权：authenticate；返回积分、角色、体验到期时间与未读通知数等派生字段。
 */
const meRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['认证'],
  summary: '获取当前用户资料',
  middleware: [authenticate],
  responses: { 200: successResponse(UserProfileSchema, '当前用户资料'), ...errorResponses },
});

/**
 * PATCH /api/auth/profile —— 更新昵称与预设头像。
 * 鉴权：authenticate；校验 profileSchema：昵称 ≤16 字，avatarType 0=色卡 / 1=自定义，
 * avatarIndex 取值 0-7。
 */
const updateProfileRoute = createRoute({
  method: 'patch',
  path: '/profile',
  tags: ['认证'],
  summary: '更新昵称与预设头像',
  middleware: [authenticate],
  request: { body: jsonBody(profileSchema) },
  responses: { 200: successResponse(UserProfileSchema, '资料已更新'), ...errorResponses },
});

/**
 * POST /api/auth/avatar —— 上传自定义头像（multipart/form-data 的 file 字段）。
 * 鉴权：authenticate；文件由 controller 校验（≤2MB、jpg/png/webp）。
 * 副作用：写入对象存储 avatars/{userId}/ 前缀并更新用户 avatarUrl。
 */
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

/**
 * GET /api/auth/checkin —— 查询今日是否已签到及每日签到积分。
 * 鉴权：authenticate；只读，不改变账户状态。
 */
const checkinStatusRoute = createRoute({
  method: 'get',
  path: '/checkin',
  tags: ['认证'],
  summary: '查询今日签到状态',
  middleware: [authenticate],
  responses: { 200: successResponse(CheckinStatusSchema, '签到状态'), ...errorResponses },
});

/**
 * POST /api/auth/checkin —— 每日签到领取解锁积分（默认 2 分，来自 sys_config）。
 * 鉴权：authenticate；幂等：当日重复签到返回 checkin=false，不再加分。
 */
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
