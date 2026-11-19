import type { OrderStatus, PayType } from '@sylvie/types';

import type { SqlFragment, SqlStatement } from '../shared.js';

/** 管理后台订单列表行。 */
export interface OrderRow {
  id: number;
  orderNo: string;
  userId: number;
  nickname: string;
  email: string;
  bizType: 'vip' | 'unlock';
  payType: PayType;
  amountCents: number;
  pointsCost: number;
  vipDays: number;
  status: OrderStatus;
  planName: string | null;
  albumTitle: string | null;
  tradeNo: string | null;
  paidAt: string | null;
  refundAt: string | null;
  refundReason: string | null;
  createdAt: string;
}

/** 退款加锁读取的订单行。 */
export interface RefundOrderRow {
  id: number;
  orderNo: string;
  /** 支付宝交易流水号；支付履约后写入。 */
  tradeNo: string | null;
  userId: number;
  bizType: 'vip' | 'unlock';
  payType: PayType;
  status: OrderStatus;
  amountCents: number;
}

export interface OrderFilter {
  biz?: string;
  status?: string;
  keyword?: string;
  from?: string;
  to?: string;
}

export interface PaymentRevenueRow {
  revenue: string | number;
}

export interface PaymentTodayRow {
  revenue: string | number;
  cnt: number;
}

export interface VipOrderStatsRow {
  cnt: number;
  cash: string | number;
}

export interface UnlockOrderStatsRow {
  cnt: number;
  points: string | number;
}

const ORDER_SELECT = `o.id, o.order_no AS orderNo, o.user_id AS userId, u.nickname, u.email,
  o.biz_type AS bizType, o.pay_type AS payType, o.amount_cents AS amountCents,
  o.points_cost AS pointsCost, o.vip_days AS vipDays, o.status,
  p.name AS planName, a.title AS albumTitle, o.trade_no AS tradeNo,
  o.paid_at AS paidAt, o.refund_at AS refundAt, o.refund_reason AS refundReason,
  o.created_at AS createdAt`;

const ORDER_FROM = `FROM pay_order o
  JOIN \`user\` u ON u.id = o.user_id
  LEFT JOIN membership_plan p ON p.id = o.plan_id
  LEFT JOIN album a ON a.id = o.album_id`;

/** 订单列表筛选条件。 */
export function buildOrderWhere(filter: OrderFilter): SqlFragment {
  const conditions = ['1 = 1'];
  const params: unknown[] = [];

  if (filter.biz === 'vip' || filter.biz === 'unlock') {
    conditions.push('o.biz_type = ?');
    params.push(filter.biz);
  }
  if (
    filter.status === 'created' ||
    filter.status === 'paid' ||
    filter.status === 'refunded' ||
    filter.status === 'closed'
  ) {
    conditions.push('o.status = ?');
    params.push(filter.status);
  }
  const keyword = filter.keyword?.trim() ?? '';
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(o.order_no LIKE ? OR u.nickname LIKE ? OR u.email LIKE ?)');
    params.push(like, like, like);
  }
  if (filter.from) {
    conditions.push('o.paid_at IS NOT NULL AND DATE(o.paid_at) >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push('o.paid_at IS NOT NULL AND DATE(o.paid_at) <= ?');
    params.push(filter.to);
  }

  return { sql: conditions.join(' AND '), params };
}

export function countAdminOrders(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total ${ORDER_FROM} WHERE ${where.sql}`,
    params: where.params,
  };
}

export function selectAdminOrders(
  where: SqlFragment,
  limit: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT ${ORDER_SELECT} ${ORDER_FROM}
        WHERE ${where.sql}
        ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC
        LIMIT ? OFFSET ?`,
    params: [...where.params, limit, offset],
  };
}

export function selectOrderTotalRevenue(): SqlStatement {
  return {
    sql: `SELECT COALESCE(SUM(amount_cents), 0) AS revenue
         FROM pay_order WHERE status = 'paid' AND amount_cents > 0`,
    params: [],
  };
}

export function selectOrderTodayRevenue(): SqlStatement {
  return {
    sql: `SELECT COALESCE(SUM(amount_cents), 0) AS revenue, COUNT(*) AS cnt
         FROM pay_order
        WHERE status = 'paid' AND amount_cents > 0 AND DATE(paid_at) = CURDATE()`,
    params: [],
  };
}

export function selectVipOrderStats(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_cents), 0) AS cash
         FROM pay_order WHERE status = 'paid' AND biz_type = 'vip'`,
    params: [],
  };
}

export function selectUnlockOrderStats(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS cnt, COALESCE(SUM(points_cost), 0) AS points
         FROM pay_order WHERE status = 'paid' AND biz_type = 'unlock'`,
    params: [],
  };
}

/** 退款前预读（不加锁）：用于判断是否需要对支付宝发起真实退款。 */
export function selectOrderForRefundPreview(orderId: number): SqlStatement {
  return {
    sql: `SELECT id, order_no AS orderNo, trade_no AS tradeNo, user_id AS userId,
              biz_type AS bizType, pay_type AS payType, status, amount_cents AS amountCents
         FROM pay_order WHERE id = ? LIMIT 1`,
    params: [orderId],
  };
}

export function selectOrderForRefund(orderId: number): SqlStatement {
  return {
    sql: `SELECT id, order_no AS orderNo, trade_no AS tradeNo, user_id AS userId,
              biz_type AS bizType, pay_type AS payType, status, amount_cents AS amountCents
         FROM pay_order WHERE id = ? FOR UPDATE`,
    params: [orderId],
  };
}

export function updateOrderRefund(refundReason: string, orderId: number): SqlStatement {
  return {
    sql: `UPDATE pay_order SET status = 'refunded', refund_at = NOW(), refund_reason = ?
        WHERE id = ?`,
    params: [refundReason, orderId],
  };
}

export function revokeVipPrivilege(userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET role = 'member', vip_expire_at = NULL
        WHERE id = ? AND role <> 'admin'`,
    params: [userId],
  };
}

export function insertRefundNotification(userId: number, content: string): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'benefit', '会员订单已退款', ?)`,
    params: [userId, content],
  };
}

export function selectOrderById(orderId: number): SqlStatement {
  return {
    sql: `SELECT ${ORDER_SELECT} ${ORDER_FROM} WHERE o.id = ? LIMIT 1`,
    params: [orderId],
  };
}

export function selectOrdersForExport(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT ${ORDER_SELECT} ${ORDER_FROM}
      WHERE ${where.sql}
      ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC`,
    params: where.params,
  };
}
