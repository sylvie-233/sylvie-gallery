/**
 * 后台订单控制器：支付流水列表、CSV 导出与退款。
 * 导出直接输出文件流；退款会收回会员权益并取消未触发的到期通知。
 */
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

/** GET /api/admin/orders —— 参数来自 query，返回订单分页与汇总数据。 */
export async function list(c: AppContext, query: OrderListInput) {
  return success(c, await getAdminOrders(query));
}

/** GET /api/admin/orders/export —— 按同样筛选导出 CSV；空结果返回 JSON 而非文件。 */
export async function exportOrders(c: AppContext, query: OrderListInput) {
  const operator = adminOperator(c);
  const result = await exportAdminOrders(operator.adminId, query, operator.ip);
  if (result.count === 0) {
    return success(c, { filename: null, count: 0 }, '当前筛选结果为空，未生成文件');
  }
  // 直接输出 CSV 文件流；filename* 用于兼容中文文件名，禁用缓存避免导出旧数据。
  return c.body(result.csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="pay.csv"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    'Cache-Control': 'no-store',
  });
}

/** POST /api/admin/orders/:id/refund —— 入参 reason 可选；退款成功后收回会员权益。 */
export async function refund(
  c: AppContext,
  id: number,
  input: RefundInput,
) {
  const operator = adminOperator(c);
  const result = await refundAdminOrder(operator.adminId, id, input.reason, operator.ip);
  // 退款已收回权益，移除尚未触发的到期通知，避免后续误发提醒。
  await cancelVipExpiryNotice(result.user.id);
  return success(c, result, '订单已退款，会员权益已收回');
}
