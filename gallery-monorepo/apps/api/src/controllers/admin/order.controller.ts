import { cancelVipExpiryNotice } from '../../jobs/index.js';
import {
  exportAdminOrders,
  getAdminOrders,
  refundAdminOrder,
} from '../../services/admin/order-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { OrderListInput, RefundInput } from '../../validators/admin/commerce.js';
import { adminOperator } from './helpers.js';

/** GET /api/admin/orders */
export async function list(c: AppContext, query: OrderListInput): Promise<Response> {
  return success(c, await getAdminOrders(query));
}

/** GET /api/admin/orders/export */
export async function exportOrders(c: AppContext, query: OrderListInput): Promise<Response> {
  const operator = adminOperator(c);
  const result = await exportAdminOrders(operator.adminId, query, operator.ip);
  if (result.count === 0) {
    return success(c, { filename: null, count: 0 }, '当前筛选结果为空，未生成文件');
  }
  return c.body(result.csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="pay.csv"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    'Cache-Control': 'no-store',
  });
}

/** POST /api/admin/orders/:id/refund */
export async function refund(
  c: AppContext,
  id: number,
  input: RefundInput,
): Promise<Response> {
  const operator = adminOperator(c);
  const result = await refundAdminOrder(operator.adminId, id, input.reason, operator.ip);
  // 退款已收回权益，移除尚未触发的到期通知。
  await cancelVipExpiryNotice(result.user.id);
  return success(c, result, '订单已退款，会员权益已收回');
}
