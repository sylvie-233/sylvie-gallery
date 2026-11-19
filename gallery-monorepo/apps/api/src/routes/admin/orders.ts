/**
 * 后台订单接口：支付流水列表、CSV 导出与退款。
 * 导出直接返回文件流；退款会收回会员权益并取消到期通知。
 */
import { createRoute, z } from '@hono/zod-openapi';

import * as orderController from '../../controllers/admin/order.controller.js';
import {
  AdminOrderExportSchema,
  AdminOrderPageSchema,
  AdminOrderRowSchema,
} from '../../openapi/models/admin.js';
import {
  errorResponses,
  idParamsSchema,
  jsonBody,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { orderListSchema, refundSchema } from '../../validators/admin/commerce.js';

const router = createApiRouter();

/** GET /api/admin/orders —— 订单分页与汇总，支持业务类型、支付状态、关键词与日期筛选。 */
const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 订单'],
  summary: '后台支付流水',
  request: { query: orderListSchema },
  responses: { 200: successResponse(AdminOrderPageSchema, '订单分页与汇总'), ...errorResponses },
});

/** GET /api/admin/orders/export —— 按同样筛选导出 CSV；结果为空时退回 JSON 统一响应。 */
const exportRoute = createRoute({
  method: 'get',
  path: '/export',
  tags: ['后台 · 订单'],
  summary: '导出支付流水 CSV',
  request: { query: orderListSchema },
  responses: {
    200: {
      description: 'CSV 文件流；筛选结果为空时返回统一 JSON 响应',
      content: {
        'text/csv': {
          schema: z.string().openapi({ type: 'string', format: 'binary' }),
        },
        'application/json': successResponse(
          AdminOrderExportSchema,
          '筛选结果为空，未生成文件',
        ).content['application/json'],
      },
    },
    ...errorResponses,
  },
});

/** POST /api/admin/orders/{id}/refund —— 退款并收回会员权益，退款原因可选（≤255 字）。 */
const refundRoute = createRoute({
  method: 'post',
  path: '/{id}/refund',
  tags: ['后台 · 订单'],
  summary: '退款并收回会员权益',
  request: { params: idParamsSchema, body: jsonBody(refundSchema) },
  responses: { 200: successResponse(AdminOrderRowSchema, '退款结果'), ...errorResponses },
});

router.openapi(
  listRoute,
  routeHandler(listRoute, (c) => orderController.list(c, c.req.valid('query'))),
);
router.openapi(
  exportRoute,
  routeHandler(exportRoute, (c) => orderController.exportOrders(c, c.req.valid('query'))),
);
router.openapi(
  refundRoute,
  routeHandler(refundRoute, (c) =>
    orderController.refund(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);

export default router;
