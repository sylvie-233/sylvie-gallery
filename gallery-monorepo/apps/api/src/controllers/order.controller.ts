import { createVipOrder, getPurchases, listPlans, payOrder } from '../services/order.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import type { CreateVipInput, PurchasesQueryInput } from '../validators/misc.js';
import { requireUser } from './helpers.js';

/** GET /api/orders/plans */
export async function plans(c: AppContext): Promise<Response> {
  return success(c, await listPlans());
}

/** POST /api/orders/vip */
export async function createVip(c: AppContext, input: CreateVipInput): Promise<Response> {
  return success(
    c,
    await createVipOrder(requireUser(c).id, input.planCode),
    '订单已创建',
  );
}

/** POST /api/orders/:orderNo/pay */
export async function pay(c: AppContext, orderNo: string): Promise<Response> {
  return success(c, await payOrder(orderNo, requireUser(c).id), '支付成功');
}

/** GET /api/orders/mine */
export async function mine(c: AppContext, query: PurchasesQueryInput): Promise<Response> {
  return success(
    c,
    await getPurchases(
      requireUser(c).id,
      query.ordersPage,
      query.unlocksPage,
      query.pageSize,
    ),
  );
}
