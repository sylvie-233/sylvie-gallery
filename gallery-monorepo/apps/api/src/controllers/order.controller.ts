import { cacheKey, cached } from '../cache/index.js';
import { scheduleVipExpiryNotice } from '../jobs/index.js';
import { publishPaymentPaid } from '../mq/index.js';
import {
  createVipOrder,
  fulfillVipOrder,
  getOrderStatus,
  getPurchases,
  listPlans,
  payOrder,
} from '../services/order.service.js';
import { parseAlipayNotify } from '../services/payment.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import { moduleLogger } from '../utils/logger.js';
import type { CreateVipInput, PurchasesQueryInput } from '../validators/misc.js';
import { requireUser } from './helpers.js';

const log = moduleLogger('order');

/** GET /api/orders/plans：套餐极少变动，缓存 5 分钟。 */
export async function plans(c: AppContext): Promise<Response> {
  return success(c, await cached(cacheKey('orders', 'plans'), 300, listPlans));
}

/** POST /api/orders/vip */
export async function createVip(c: AppContext, input: CreateVipInput): Promise<Response> {
  return success(
    c,
    await createVipOrder(requireUser(c).id, input.planCode),
    '订单已创建',
  );
}

/** POST /api/orders/:orderNo/pay（仅模拟支付模式） */
export async function pay(c: AppContext, orderNo: string): Promise<Response> {
  const user = requireUser(c);
  const order = await payOrder(orderNo, user.id);
  await scheduleVipExpiryNotice(user.id);
  return success(c, order, '支付成功');
}

/** GET /api/orders/:orderNo/status：支付回跳后轮询订单状态。 */
export async function status(c: AppContext, orderNo: string): Promise<Response> {
  return success(c, await getOrderStatus(orderNo, requireUser(c).id));
}

/**
 * POST /api/orders/alipay/notify：支付宝异步通知。
 *
 * 验签 → 入队（MQ）→ 消费端幂等履约。MQ 不可用时同步履约作为兜底。
 * 支付宝要求响应纯文本 `success`，否则会持续重试。
 */
export async function alipayNotify(
  c: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const notification = parseAlipayNotify(params);
  if (!notification) {
    log.warn('支付宝通知验签失败', { orderNo: params.out_trade_no ?? '' });
    return c.body('failure', 400, { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  if (notification.status !== 'paid') {
    // 等待付款 / 交易关闭等状态无需履约，直接确认避免支付宝重试。
    return c.body('success', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  if (!notification.orderNo) {
    log.error('支付宝通知缺少订单号');
    return c.body('failure', 400, { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  const published = await publishPaymentPaid({
    orderNo: notification.orderNo,
    tradeNo: notification.tradeNo ?? '',
    amountCents: notification.amountCents,
  });

  if (!published) {
    try {
      const result = await fulfillVipOrder(
        notification.orderNo,
        notification.tradeNo ?? `ALIPAY${Date.now()}`,
        notification.amountCents,
      );
      await scheduleVipExpiryNotice(result.userId);
    } catch (error) {
      log.error('支付宝通知同步履约失败', error, {
        orderNo: notification.orderNo,
        tradeNo: notification.tradeNo,
      });
      return c.body('failure', 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  }

  log.info('支付宝通知已处理', {
    orderNo: notification.orderNo,
    tradeNo: notification.tradeNo,
    viaMq: published,
  });
  return c.body('success', 200, { 'Content-Type': 'text/plain; charset=utf-8' });
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
