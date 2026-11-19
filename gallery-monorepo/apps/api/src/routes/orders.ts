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

const plansRoute = createRoute({
  method: 'get',
  path: '/plans',
  tags: ['订单'],
  summary: '会员套餐列表',
  security: [],
  responses: { 200: successResponse(PlanListSchema, '会员套餐'), ...errorResponses },
});

const createVipRoute = createRoute({
  method: 'post',
  path: '/vip',
  tags: ['订单'],
  summary: '创建会员开通 / 续费订单',
  middleware: [authenticate],
  request: { body: jsonBody(createVipSchema) },
  responses: { 200: successResponse(VipOrderResultSchema, '订单已创建'), ...errorResponses },
});

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
  mineRoute,
  routeHandler(mineRoute, (c) => orderController.mine(c, c.req.valid('query'))),
);

export default router;
