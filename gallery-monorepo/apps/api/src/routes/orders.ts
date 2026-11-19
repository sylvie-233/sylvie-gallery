/**
 * 前台订单接口：会员套餐、创建开通 / 续费订单、模拟支付、支付回跳轮询、
 * 我的购买概览，以及支付宝异步通知（表单提交，不经过 JWT）。
 */
import { createRoute } from '@hono/zod-openapi';

import * as orderController from '../controllers/order.controller.js';
import { authenticate } from '../middleware/auth.js';
import {
  errorResponses,
  jsonBody,
  orderNoParamsSchema,
  successResponse,
} from '../openapi/models/common.js';
import {
  OrderSchema,
  PlanListSchema,
  PurchaseDataSchema,
  VipOrderResultSchema,
} from '../openapi/models/order.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { createVipSchema, purchasesQuerySchema } from '../validators/misc.js';

const router = createApiRouter();

/**
 * GET /api/orders/plans —— 会员套餐列表。
 * 鉴权：无（游客可查看价格）；价格字段 priceCents 单位为「分」。
 */
const plansRoute = createRoute({
  method: 'get',
  path: '/plans',
  tags: ['订单'],
  summary: '会员套餐列表',
  security: [],
  responses: { 200: successResponse(PlanListSchema, '会员套餐'), ...errorResponses },
});

/**
 * POST /api/orders/vip —— 创建会员开通 / 续费订单。
 * 鉴权：authenticate；校验 createVipSchema 的 planCode 是否存在且上架。
 * 响应：订单 + 支付信息（本地 mock 时 payUrl 为空）；续费在剩余到期时间上叠加。
 */
const createVipRoute = createRoute({
  method: 'post',
  path: '/vip',
  tags: ['订单'],
  summary: '创建会员开通 / 续费订单',
  middleware: [authenticate],
  request: { body: jsonBody(createVipSchema) },
  responses: { 200: successResponse(VipOrderResultSchema, '订单已创建'), ...errorResponses },
});

/**
 * POST /api/orders/{orderNo}/pay —— 模拟支付（ALIPAY_MOCK=true 时使用）。
 * 鉴权：authenticate 且仅能支付本人订单；真实支付宝流程走收银台 + 异步通知。
 * 副作用：标记订单已支付、开通 / 续期会员，并登记会员到期通知任务。
 */
const payRoute = createRoute({
  method: 'post',
  path: '/{orderNo}/pay',
  tags: ['订单'],
  summary: '支付订单',
  description: '本地开发默认使用模拟支付，支付成功后立即生效。',
  middleware: [authenticate],
  request: { params: orderNoParamsSchema },
  responses: { 200: successResponse(OrderSchema, '支付成功'), ...errorResponses },
});

/**
 * GET /api/orders/{orderNo}/status —— 查询订单状态。
 * 鉴权：authenticate；支付回跳后前端轮询此接口直到 paid / closed。
 */
const statusRoute = createRoute({
  method: 'get',
  path: '/{orderNo}/status',
  tags: ['订单'],
  summary: '查询订单状态',
  description: '支付宝支付回跳后轮询；仅能查询本人订单。',
  middleware: [authenticate],
  request: { params: orderNoParamsSchema },
  responses: { 200: successResponse(OrderSchema, '订单状态'), ...errorResponses },
});

/**
 * GET /api/orders/mine —— 我的购买数据。
 * 鉴权：authenticate；query 分别控制订单页与解锁记录页（ordersPage / unlocksPage，每页 ≤24）。
 * 响应：订单分页、图集解锁分页与累计消费概览（金额单位：分）。
 */
const mineRoute = createRoute({
  method: 'get',
  path: '/mine',
  tags: ['订单'],
  summary: '我的购买',
  description: '返回订单分页、图集解锁记录与累计消费统计。',
  middleware: [authenticate],
  request: { query: purchasesQuerySchema },
  responses: { 200: successResponse(PurchaseDataSchema, '我的购买数据'), ...errorResponses },
});

router.openapi(plansRoute, routeHandler(plansRoute, (c) => orderController.plans(c)));
router.openapi(
  createVipRoute,
  routeHandler(createVipRoute, (c) => orderController.createVip(c, c.req.valid('json'))),
);
router.openapi(
  payRoute,
  routeHandler(payRoute, (c) => orderController.pay(c, c.req.valid('param').orderNo)),
);
router.openapi(
  statusRoute,
  routeHandler(statusRoute, (c) => orderController.status(c, c.req.valid('param').orderNo)),
);
router.openapi(
  mineRoute,
  routeHandler(mineRoute, (c) => orderController.mine(c, c.req.valid('query'))),
);

/**
 * 支付宝异步通知：表单提交，响应纯文本，不需要 JWT。
 *
 * 不使用 createRoute：支付宝以 application/x-www-form-urlencoded 推送且只认纯文本
 * `success`，无法套用统一的 JSON 响应模型；验签与履约逻辑在 controller 中完成。
 */
router.post('/alipay/notify', async (c) => {
  const body = await c.req.parseBody();
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      params[key] = value;
    }
  }
  return orderController.alipayNotify(c, params);
});

export default router;
