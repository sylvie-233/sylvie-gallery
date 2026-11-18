import { Hono } from 'hono';
import { z } from 'zod';

import { authenticate } from '../middleware/auth.js';
import {
  createVipOrder,
  getPurchases,
  listPlans,
  payOrder,
} from '../services/order.service.js';
import type { AppEnv } from '../types/context.js';
import { HttpError, success } from '../utils/http.js';
import { parseJson, parseQuery } from '../utils/validate.js';

const router = new Hono<AppEnv>();

router.get('/plans', async (c) => {
  return success(c, await listPlans());
});

const createSchema = z.object({
  planCode: z.string().trim().min(1, '请选择会员套餐').max(32),
});

router.post('/vip', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const input = await parseJson(c, createSchema);
  return success(c, await createVipOrder(user.id, input.planCode), '订单已创建');
});

router.post('/:orderNo/pay', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const orderNo = c.req.param('orderNo') ?? '';
  if (!/^[A-Za-z0-9]{8,32}$/.test(orderNo)) {
    throw new HttpError(400, '订单号无效');
  }
  const order = await payOrder(orderNo, user.id);
  return success(c, order, '支付成功');
});

const purchasesSchema = z.object({
  ordersPage: z.coerce.number().int().min(1).optional(),
  unlocksPage: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(24).optional(),
});

router.get('/mine', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const query = parseQuery(c, purchasesSchema);
  return success(
    c,
    await getPurchases(user.id, query.ordersPage, query.unlocksPage, query.pageSize),
  );
});

export default router;
