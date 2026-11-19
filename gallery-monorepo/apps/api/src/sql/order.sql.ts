import type { OrderStatus, PayType } from '@sylvie/types';

import type { SqlStatement } from './shared.js';

/**
 * 前台订单 / 会员 SQL：套餐、支付宝会员订单、积分解锁与「我的购买」。
 * 金额字段统一以「分」为单位存储；支付与解锁的关键读写均在事务内 `FOR UPDATE`
 * 加锁，履约按订单状态幂等处理。
 */

/** 会员套餐行：`priceCents` 为分，`durationDays` 为开通 / 续费天数。 */
export interface PlanRow {
  id: number;
  code: string;
  name: string;
  priceCents: number;
  durationDays: number;
  benefits: string | null;
  status: number;
}

/** 订单行：关联套餐名称与图集标题；`amountCents` 为分，解锁订单为 0。 */
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

/** 支付事务内 `FOR UPDATE` 加锁读取的订单行，用于幂等履约与金额校验。 */
export interface PayOrderLockRow {
  id: number;
  userId: number;
  bizType: 'vip' | 'unlock';
  status: OrderStatus;
  vipDays: number;
  amountCents: number;
  planName: string | null;
}

/** 解锁事务内 `FOR UPDATE` 加锁读取的用户行（积分、角色、会员到期）。 */
export interface UnlockUserRow {
  points: number;
  role: 'member' | 'vip' | 'admin';
  vipExpireAt: string | null;
}

/** 解锁事务内 `FOR UPDATE` 加锁读取的图集行（所需解锁积分）。 */
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

/** 我的购买概览行：累计消费（分）与已支付会员订单数。 */
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

/** 会员套餐列表：仅启用套餐，按价格（分）升序、id 升序。 */
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

/**
 * 按订单号查询订单。
 * 传入 `userId` 时追加归属条件，用于支付回跳轮询等用户侧查询，防止越权。
 */
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

/**
 * 创建待支付会员订单：`biz_type='vip'`、支付宝、状态 `created`。
 * `amountCents` 为分，由套餐价格快照写入，避免后续套餐改价影响已创建订单。
 */
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

/**
 * 支付履约事务：按订单号 `FOR UPDATE` 加锁读取订单。
 * 同一订单的异步通知、MQ 消费与模拟支付因此串行化，配合状态判断实现幂等。
 */
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

/**
 * 支付履约事务：标记订单已支付并记录支付宝交易流水号与支付时间。
 * 仅在状态校验通过后由 service 调用，重复通知不会再次执行。
 */
export function markOrderPaid(tradeNo: string, orderId: number): SqlStatement {
  return {
    sql: `UPDATE pay_order SET status = 'paid', trade_no = ?, paid_at = NOW() WHERE id = ?`,
    params: [tradeNo, orderId],
  };
}

/**
 * 支付履约事务：开通 / 续费付费会员。
 * 续费在剩余有效期上叠加：以 `GREATEST(COALESCE(vip_expire_at, NOW()), NOW())` 为基准
 * 加 `vipDays` 天，会员已过期时从当前时间起算，不会回退；管理员角色保持不变。
 */
export function activateVipAfterPayment(vipDays: number, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\`
            SET role = IF(role = 'admin', 'admin', 'vip'),
                vip_expire_at = DATE_ADD(GREATEST(COALESCE(vip_expire_at, NOW()), NOW()), INTERVAL ? DAY)
          WHERE id = ?`,
    params: [vipDays, userId],
  };
}

/** 支付履约事务：写入会员开通权益通知（`type='benefit'`）。 */
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

/**
 * 解锁事务：`FOR UPDATE` 加锁读取用户积分、角色与会员到期时间。
 * 加锁保证同一用户的并发解锁串行执行，避免积分被重复扣减或扣成负数。
 */
export function selectUserForUnlockForUpdate(userId: number): SqlStatement {
  return {
    sql: `SELECT points, role, vip_expire_at AS vipExpireAt
         FROM \`user\` WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
    params: [userId],
  };
}

/** 解锁事务：`FOR UPDATE` 加锁读取已发布且未软删除的图集及其所需积分。 */
export function selectAlbumForUnlockForUpdate(albumId: number): SqlStatement {
  return {
    sql: `SELECT id, title, points FROM album
        WHERE id = ? AND status = 'published' AND is_deleted = 0
        FOR UPDATE`,
    params: [albumId],
  };
}

/** 解锁事务：查询该用户是否已解锁此图集，已解锁则直接返回无需扣分。 */
export function selectAlbumUnlock(userId: number, albumId: number): SqlStatement {
  return {
    sql: `SELECT id FROM album_unlock WHERE user_id = ? AND album_id = ? LIMIT 1`,
    params: [userId, albumId],
  };
}

/**
 * 解锁事务：创建积分抵扣订单。
 * `biz_type='unlock'`、支付方式 `points`、金额 0 分、状态直接为 `paid`。
 */
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

/** 解锁事务：写入 `album_unlock` 解锁记录，永久关联用户与图集。 */
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

/**
 * 解锁事务：扣除用户解锁积分。
 * 只在同一事务已加锁并校验 `points >= pointsCost` 后调用，确保 `user.points` 不为负。
 */
export function deductUserPoints(pointsCost: number, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET points = points - ? WHERE id = ?`,
    params: [pointsCost, userId],
  };
}

/** 解锁事务：写入图集解锁成功通知（关联 album_id，便于跳转）。 */
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

/**
 * 我的购买概览：已支付订单累计金额（分）与会员订单数。
 * `totalSpent` 用 `COALESCE(SUM(...), 0)` 兜底无订单；解锁订单金额为 0 不影响累计。
 */
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

/** 我的购买：分页已支付会员订单，按支付时间、id 倒序。 */
export function selectPaidVipOrders(userId: number, limit: number, offset: number): SqlStatement {
  return {
    sql: `SELECT ${ORDER_SELECT} ${ORDER_FROM}
        WHERE o.user_id = ? AND o.status = 'paid' AND o.biz_type = 'vip'
        ORDER BY o.paid_at DESC, o.id DESC
        LIMIT ? OFFSET ?`,
    params: [userId, limit, offset],
  };
}

/** 我的购买：分页图集解锁记录，按解锁时间、id 倒序。 */
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
