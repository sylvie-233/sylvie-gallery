/**
 * 后台订单 / 支付流水的参数化 SQL：筛选列表与汇总、退款预读 / 加锁读取、退款标记、
 * 会员权益收回、退款通知与 CSV 导出查询。
 *
 * 退款相关读取（selectOrderForRefund）使用 FOR UPDATE，必须运行在 service 的事务中。
 */
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

/** 订单列表筛选参数：业务类型、状态、关键字与支付日期区间。 */
export interface OrderFilter {
  biz?: string;
  status?: string;
  keyword?: string;
  from?: string;
  to?: string;
}

/** 累计现金营收行：revenue 为金额（分）。 */
export interface PaymentRevenueRow {
  revenue: string | number;
}

/** 今日现金营收行：revenue 为金额（分），cnt 为订单数。 */
export interface PaymentTodayRow {
  revenue: string | number;
  cnt: number;
}

/** 会员订单统计行：cnt 为订单数，cash 为现金金额合计。 */
export interface VipOrderStatsRow {
  cnt: number;
  cash: string | number;
}

/** 解锁订单统计行：cnt 为解锁订单数，points 为消耗积分合计。 */
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

/**
 * 构建订单列表 WHERE 片段。
 *
 * - 以 `1 = 1` 占位便于追加条件；
 * - biz 仅接受 vip / unlock；
 * - status 仅接受 created / paid / refunded / closed；
 * - keyword 去空白后匹配订单号、用户昵称、邮箱；
 * - from / to 要求 paid_at 非空（即按支付时间筛选，未支付订单不会落入区间）。
 */
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

/** 统计当前筛选条件下的订单总数（与列表共用 FROM / JOIN）。 */
export function countAdminOrders(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total ${ORDER_FROM} WHERE ${where.sql}`,
    params: where.params,
  };
}

/** 订单分页列表：按支付时间（缺失回退创建时间）倒序、id 倒序。 */
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

/** 累计现金营收：已支付且金额 > 0 的订单合计（不限业务）。 */
export function selectOrderTotalRevenue(): SqlStatement {
  return {
    sql: `SELECT COALESCE(SUM(amount_cents), 0) AS revenue
         FROM pay_order WHERE status = 'paid' AND amount_cents > 0`,
    params: [],
  };
}

/** 今日现金营收与订单数：按 paid_at 归入今天。 */
export function selectOrderTodayRevenue(): SqlStatement {
  return {
    sql: `SELECT COALESCE(SUM(amount_cents), 0) AS revenue, COUNT(*) AS cnt
         FROM pay_order
        WHERE status = 'paid' AND amount_cents > 0 AND DATE(paid_at) = CURDATE()`,
    params: [],
  };
}

/** 会员订单统计：已支付的 vip 业务订单数与现金合计（含 0 元赠送单，金额为 0）。 */
export function selectVipOrderStats(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_cents), 0) AS cash
         FROM pay_order WHERE status = 'paid' AND biz_type = 'vip'`,
    params: [],
  };
}

/** 解锁订单统计：已支付 unlock 业务的订单数与消耗积分合计。 */
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

/**
 * 退款事务内加锁读取订单（FOR UPDATE），避免并发退款重复收回权益。
 * 与预读不同，这里必须放在事务中执行。
 */
export function selectOrderForRefund(orderId: number): SqlStatement {
  return {
    sql: `SELECT id, order_no AS orderNo, trade_no AS tradeNo, user_id AS userId,
              biz_type AS bizType, pay_type AS payType, status, amount_cents AS amountCents
         FROM pay_order WHERE id = ? FOR UPDATE`,
    params: [orderId],
  };
}

/** 标记订单已退款：status = 'refunded'，记录退款时间与原因。 */
export function updateOrderRefund(refundReason: string, orderId: number): SqlStatement {
  return {
    sql: `UPDATE pay_order SET status = 'refunded', refund_at = NOW(), refund_reason = ?
        WHERE id = ?`,
    params: [refundReason, orderId],
  };
}

/**
 * 退款后收回会员权益：role 降为 member、清空 vip_expire_at。
 * 通过 role <> 'admin' 保护管理员账号，不会被误降级。
 */
export function revokeVipPrivilege(userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET role = 'member', vip_expire_at = NULL
        WHERE id = ? AND role <> 'admin'`,
    params: [userId],
  };
}

/** 写入退款站内通知（type = 'benefit'）。 */
export function insertRefundNotification(userId: number, content: string): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'benefit', '会员订单已退款', ?)`,
    params: [userId, content],
  };
}

/** 退款完成后按 ID 读取订单详情（含用户、套餐、图集信息）。 */
export function selectOrderById(orderId: number): SqlStatement {
  return {
    sql: `SELECT ${ORDER_SELECT} ${ORDER_FROM} WHERE o.id = ? LIMIT 1`,
    params: [orderId],
  };
}

/**
 * CSV 导出查询：按与列表相同的筛选条件取全部订单（不分页），
 * 排序与列表一致，由 service 负责转义与拼接。
 */
export function selectOrdersForExport(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT ${ORDER_SELECT} ${ORDER_FROM}
      WHERE ${where.sql}
      ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC`,
    params: where.params,
  };
}
