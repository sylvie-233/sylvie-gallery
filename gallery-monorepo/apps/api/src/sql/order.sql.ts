import type { OrderStatus, PayType } from '@sylvie/types';

import type { SqlStatement } from './shared.js';

/** 会员套餐行。 */
export interface PlanRow {
  id: number;
  code: string;
  name: string;
  priceCents: number;
  durationDays: number;
  benefits: string | null;
  status: number;
}

/** 订单行：关联套餐名称与图集标题。 */
export interface OrderRow {
  id: number;
  orderNo: string;
  bizType: 'vip' | 'unlock';
  payType: PayType;
  amountCents: number;
  pointsCost: number;
  vipDays: number;
  status: OrderStatus;
  planName: string | null;
  albumId: number | null;
  albumTitle: string | null;
  tradeNo: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** 支付事务内加锁读取的订单行。 */
export interface PayOrderLockRow {
  id: number;
  userId: number;
  bizType: 'vip' | 'unlock';
  status: OrderStatus;
  vipDays: number;
  amountCents: number;
  planName: string | null;
}

/** 解锁事务内加锁读取的用户行。 */
export interface UnlockUserRow {
  points: number;
  role: 'member' | 'vip' | 'admin';
  vipExpireAt: string | null;
}

/** 解锁事务内加锁读取的图集行。 */
export interface UnlockAlbumRow {
  id: number;
  title: string;
  points: number;
}

/** 我的购买中的图集解锁行。 */
export interface UnlockRow {
  id: number;
  albumId: number;
  pointsCost: number;
  createdAt: string;
}

/** 我的购买概览行。 */
export interface PurchaseOverviewRow {
  totalSpent: number;
  vipOrders: number;
}

const ORDER_SELECT = `o.id, o.order_no AS orderNo, o.biz_type AS bizType, o.pay_type AS payType,
  o.amount_cents AS amountCents, o.points_cost AS pointsCost, o.vip_days AS vipDays,
  o.status, p.name AS planName, o.album_id AS albumId, a.title AS albumTitle,
  o.trade_no AS tradeNo, o.paid_at AS paidAt, o.created_at AS createdAt`;
const ORDER_FROM = `FROM pay_order o
  LEFT JOIN membership_plan p ON p.id = o.plan_id
  LEFT JOIN album a ON a.id = o.album_id`;

/** 会员套餐列表：仅启用套餐，按价格升序。 */
export function selectPlans(): SqlStatement {
  return {
    sql: `SELECT id, code, name, price_cents AS priceCents, duration_days AS durationDays,
            benefits, status
       FROM membership_plan
      WHERE status = 1
      ORDER BY price_cents ASC, id ASC`,
    params: [],
  };
}

/** 按编码查询启用中的会员套餐。 */
export function selectPlanByCode(planCode: string): SqlStatement {
  return {
    sql: `SELECT id, code, name, price_cents AS priceCents, duration_days AS durationDays,
            benefits, status
       FROM membership_plan WHERE code = ? AND status = 1 LIMIT 1`,
    params: [planCode],
  };
}

/** 按订单号查询订单，可选限制归属用户。 */
export function selectOrderByNo(orderNo: string, userId?: number): SqlStatement {
  const params: unknown[] = [orderNo];
  let owner = '';
  if (userId !== undefined) {
    owner = 'AND o.user_id = ?';
    params.push(userId);
  }
  return {
    sql: `SELECT ${ORDER_SELECT} ${ORDER_FROM} WHERE o.order_no = ? ${owner} LIMIT 1`,
    params,
  };
}

/** 按主键查询订单。 */
export function selectOrderById(orderId: number): SqlStatement {
  return {
    sql: `SELECT ${ORDER_SELECT} ${ORDER_FROM} WHERE o.id = ? LIMIT 1`,
    params: [orderId],
  };
}

/** 创建待支付会员订单。 */
export function insertVipOrder(input: {
  orderNo: string;
  userId: number;
  planId: number;
  amountCents: number;
  vipDays: number;
}): SqlStatement {
  return {
    sql: `INSERT INTO pay_order (order_no, user_id, biz_type, plan_id, pay_type, amount_cents, vip_days, status)
     VALUES (?, ?, 'vip', ?, 'alipay', ?, ?, 'created')`,
    params: [input.orderNo, input.userId, input.planId, input.amountCents, input.vipDays],
  };
}

/** 支付事务：按订单号加锁读取订单。 */
export function selectPayOrderForUpdate(orderNo: string): SqlStatement {
  return {
    sql: `SELECT o.id, o.user_id AS userId, o.biz_type AS bizType, o.status,
              o.vip_days AS vipDays, o.amount_cents AS amountCents, p.name AS planName
         FROM pay_order o
         LEFT JOIN membership_plan p ON p.id = o.plan_id
        WHERE o.order_no = ?
        FOR UPDATE`,
    params: [orderNo],
  };
}

/** 支付事务：标记订单已支付。 */
export function markOrderPaid(tradeNo: string, orderId: number): SqlStatement {
  return {
    sql: `UPDATE pay_order SET status = 'paid', trade_no = ?, paid_at = NOW() WHERE id = ?`,
    params: [tradeNo, orderId],
  };
}

/** 支付事务：付费会员订单开通/续费。 */
export function activateVipAfterPayment(vipDays: number, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\`
            SET role = IF(role = 'admin', 'admin', 'vip'),
                vip_expire_at = DATE_ADD(GREATEST(COALESCE(vip_expire_at, NOW()), NOW()), INTERVAL ? DAY)
          WHERE id = ?`,
    params: [vipDays, userId],
  };
}

/** 支付事务：写入权益通知。 */
export function insertOrderPaidNotification(
  userId: number,
  title: string,
  content: string,
): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'benefit', ?, ?)`,
    params: [userId, title, content],
  };
}

/** 解锁事务：加锁读取用户。 */
export function selectUserForUnlockForUpdate(userId: number): SqlStatement {
  return {
    sql: `SELECT points, role, vip_expire_at AS vipExpireAt
         FROM \`user\` WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
    params: [userId],
  };
}

/** 解锁事务：加锁读取已发布图集。 */
export function selectAlbumForUnlockForUpdate(albumId: number): SqlStatement {
  return {
    sql: `SELECT id, title, points FROM album
        WHERE id = ? AND status = 'published' AND is_deleted = 0
        FOR UPDATE`,
    params: [albumId],
  };
}

/** 解锁事务：查询是否已解锁。 */
export function selectAlbumUnlock(userId: number, albumId: number): SqlStatement {
  return {
    sql: `SELECT id FROM album_unlock WHERE user_id = ? AND album_id = ? LIMIT 1`,
    params: [userId, albumId],
  };
}

/** 解锁事务：创建积分抵扣订单。 */
export function insertUnlockOrder(input: {
  orderNo: string;
  userId: number;
  albumId: number;
  pointsCost: number;
}): SqlStatement {
  return {
    sql: `INSERT INTO pay_order (order_no, user_id, biz_type, album_id, pay_type, amount_cents, points_cost, status, paid_at)
       VALUES (?, ?, 'unlock', ?, 'points', 0, ?, 'paid', NOW())`,
    params: [input.orderNo, input.userId, input.albumId, input.pointsCost],
  };
}

/** 解锁事务：写入解锁记录。 */
export function insertAlbumUnlock(input: {
  userId: number;
  albumId: number;
  orderId: number;
  pointsCost: number;
}): SqlStatement {
  return {
    sql: `INSERT INTO album_unlock (user_id, album_id, order_id, points_cost) VALUES (?, ?, ?, ?)`,
    params: [input.userId, input.albumId, input.orderId, input.pointsCost],
  };
}

/** 解锁事务：扣除用户解锁积分。 */
export function deductUserPoints(pointsCost: number, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET points = points - ? WHERE id = ?`,
    params: [pointsCost, userId],
  };
}

/** 解锁事务：写入图集解锁成功通知。 */
export function insertAlbumUnlockedNotification(
  userId: number,
  content: string,
  albumId: number,
): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content, album_id)
       VALUES (?, 'benefit', '图集解锁成功', ?, ?)`,
    params: [userId, content, albumId],
  };
}

/** 我的购买概览：累计消费与会员订单数。 */
export function selectPurchaseOverview(userId: number): SqlStatement {
  return {
    sql: `SELECT COALESCE(SUM(amount_cents), 0) AS totalSpent,
              SUM(CASE WHEN biz_type = 'vip' THEN 1 ELSE 0 END) AS vipOrders
         FROM pay_order WHERE user_id = ? AND status = 'paid'`,
    params: [userId],
  };
}

/** 我的购买：已支付会员订单数。 */
export function countPaidVipOrders(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM pay_order
        WHERE user_id = ? AND status = 'paid' AND biz_type = 'vip'`,
    params: [userId],
  };
}

/** 我的购买：图集解锁总数。 */
export function countAlbumUnlocks(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM album_unlock WHERE user_id = ?`,
    params: [userId],
  };
}

/** 我的购买：分页会员订单。 */
export function selectPaidVipOrders(userId: number, limit: number, offset: number): SqlStatement {
  return {
    sql: `SELECT ${ORDER_SELECT} ${ORDER_FROM}
        WHERE o.user_id = ? AND o.status = 'paid' AND o.biz_type = 'vip'
        ORDER BY o.paid_at DESC, o.id DESC
        LIMIT ? OFFSET ?`,
    params: [userId, limit, offset],
  };
}

/** 我的购买：分页图集解锁记录。 */
export function selectAlbumUnlocks(userId: number, limit: number, offset: number): SqlStatement {
  return {
    sql: `SELECT id, album_id AS albumId, points_cost AS pointsCost, created_at AS createdAt
         FROM album_unlock
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?`,
    params: [userId, limit, offset],
  };
}
