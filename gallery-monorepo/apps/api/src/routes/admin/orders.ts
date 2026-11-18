import { Hono } from 'hono';
import { z } from 'zod';

import {
  exportAdminOrders,
  getAdminOrders,
  refundAdminOrder,
} from '../../services/admin/order-admin.service.js';
import type { AppEnv } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { currentAdminId, getRequestIp } from '../../utils/request.js';
import { parseId, parseJson, parseQuery } from '../../utils/validate.js';

const router = new Hono<AppEnv>();

const listSchema = z.object({
  biz: z.enum(['all', 'vip', 'unlock']).optional(),
  status: z.enum(['all', 'created', 'paid', 'refunded', 'closed']).optional(),
  keyword: z.string().trim().max(64).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

router.get('/', async (c) => {
  const query = parseQuery(c, listSchema);
  return success(c, await getAdminOrders(query));
});

router.get('/export', async (c) => {
  const query = parseQuery(c, listSchema);
  const result = await exportAdminOrders(currentAdminId(c), query, getRequestIp(c));
  if (result.count === 0) {
    return success(c, { filename: null, count: 0 }, '当前筛选结果为空，未生成文件');
  }
  return c.body(result.csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="pay.csv"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    'Cache-Control': 'no-store',
  });
});

const refundSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});

router.post('/:id/refund', async (c) => {
  const id = parseId(c.req.param('id'), '订单 ID');
  const input = await parseJson(c, refundSchema);
  const result = await refundAdminOrder(currentAdminId(c), id, input.reason, getRequestIp(c));
  return success(c, result, '订单已退款，会员权益已收回');
});

export default router;
