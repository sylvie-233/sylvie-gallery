/**
 * 前台订单控制器：套餐、创建会员订单、模拟支付、状态轮询、我的购买与支付宝异步通知。
 * 金额字段一律以「分」为单位；真实支付的履约统一走 fulfillVipOrder，保证幂等。
 */
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

/** GET /api/orders/plans —— 会员套餐列表：套餐极少变动，缓存 5 分钟。 */
export async function plans(c: AppContext) {
  return success(c, await cached(cacheKey('orders', 'plans'), 300, listPlans));
}

/**
 * POST /api/orders/vip —— 创建会员开通 / 续费订单。
 *
 * @param input 路由校验后的 createVipSchema（planCode）
 * 副作用：写入 created 状态订单；返回订单与支付信息（mock 模式下无需跳转收银台）。
 */
export async function createVip(c: AppContext, input: CreateVipInput) {
  return success(
    c,
    await createVipOrder(requireUser(c).id, input.planCode),
    '订单已创建',
  );
}

/**
 * POST /api/orders/:orderNo/pay —— 模拟支付（仅 ALIPAY_MOCK=true 时使用）。
 *
 * @param orderNo 路径参数，来自 `c.req.valid('param').orderNo`
 * 副作用：标记订单已支付并履约开通会员，同时登记会员到期提醒的延时任务。
 */
export async function pay(c: AppContext, orderNo: string) {
  const user = requireUser(c);
  const order = await payOrder(orderNo, user.id);
  await scheduleVipExpiryNotice(user.id);
  return success(c, order, '支付成功');
}

/**
 * GET /api/orders/:orderNo/status —— 查询订单状态。
 *
 * @param orderNo 路径参数；仅限本人订单（服务层校验 userId）。
 * 支付回跳后前端轮询此接口，直到 paid 或 closed。
 */
export async function status(c: AppContext, orderNo: string) {
  return success(c, await getOrderStatus(orderNo, requireUser(c).id));
}

/**
 * POST /api/orders/alipay/notify —— 支付宝异步通知。
 *
 * @param params 由路由从 application/x-www-form-urlencoded 表单解析出的字符串键值对
 * 验签 → 入队（MQ）→ 消费端幂等履约。MQ 不可用时同步履约作为兜底。
 * 支付宝要求响应纯文本 `success`，否则会持续重试；验签失败或缺少订单号返回 `failure`。
 */
export async function alipayNotify(
  c: AppContext,
  params: Record<string, string>,
) {
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

  // MQ 未启用或投递失败时同步履约兜底；fulfillVipOrder 内部按订单号幂等。
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

/**
 * GET /api/orders/mine —— 我的购买数据。
 *
 * @param query 路由校验后的 purchasesQuerySchema（ordersPage / unlocksPage / pageSize）
 * 返回订单分页、解锁记录分页与累计消费概览（金额单位：分）。
 */
export async function mine(c: AppContext, query: PurchasesQueryInput) {
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
