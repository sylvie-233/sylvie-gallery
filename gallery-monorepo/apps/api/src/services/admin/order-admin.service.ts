import type {
  AdminOrderPage,
  AdminOrderRow,
  AdminPaymentSummary,
  OrderStatus,
  PayType,
} from '@sylvie/types';

import { dbClient, queryOneOn } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toNumber, toPageResult } from '../../utils/format.js';
import { logAdminOp } from './log.service.js';

interface OrderDbRow {
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

function mapOrder(row: OrderDbRow): AdminOrderRow {
  return {
    id: Number(row.id),
    orderNo: row.orderNo,
    user: { id: Number(row.userId), nickname: row.nickname, email: row.email },
    bizType: row.bizType,
    payType: row.payType,
    amountCents: Number(row.amountCents),
    pointsCost: Number(row.pointsCost),
    vipDays: Number(row.vipDays),
    status: row.status,
    planName: row.planName,
    albumTitle: row.albumTitle,
    tradeNo: row.tradeNo,
    paidAt: row.paidAt,
    refundAt: row.refundAt,
    refundReason: row.refundReason,
    createdAt: row.createdAt,
  };
}

interface OrderFilter {
  biz?: string;
  status?: string;
  keyword?: string;
  from?: string;
  to?: string;
}

function buildOrderWhere(filter: OrderFilter): { where: string; params: unknown[] } {
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

  return { where: conditions.join(' AND '), params };
}

async function getPaymentSummary(): Promise<AdminPaymentSummary> {
  const [totalRow, todayRow, vipRow, unlockRow] = await Promise.all([
    dbClient.queryOne<{ revenue: string | number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS revenue
         FROM pay_order WHERE status = 'paid' AND amount_cents > 0`,
    ),
    dbClient.queryOne<{ revenue: string | number; cnt: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS revenue, COUNT(*) AS cnt
         FROM pay_order
        WHERE status = 'paid' AND amount_cents > 0 AND DATE(paid_at) = CURDATE()`,
    ),
    dbClient.queryOne<{ cnt: number; cash: string | number }>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_cents), 0) AS cash
         FROM pay_order WHERE status = 'paid' AND biz_type = 'vip'`,
    ),
    dbClient.queryOne<{ cnt: number; points: string | number }>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(points_cost), 0) AS points
         FROM pay_order WHERE status = 'paid' AND biz_type = 'unlock'`,
    ),
  ]);

  return {
    totalRevenueCents: toNumber(totalRow?.revenue),
    todayRevenueCents: toNumber(todayRow?.revenue),
    todayOrderCount: Number(todayRow?.cnt ?? 0),
    vipOrderCount: Number(vipRow?.cnt ?? 0),
    vipCashCents: toNumber(vipRow?.cash),
    unlockCount: Number(unlockRow?.cnt ?? 0),
    unlockPoints: toNumber(unlockRow?.points),
  };
}

export async function getAdminOrders(
  filter: OrderFilter & { page?: number; pageSize?: number },
): Promise<AdminOrderPage> {
  const { page, pageSize, offset } = normalizePage(filter.page, filter.pageSize, 8);
  const { where, params } = buildOrderWhere(filter);

  const [countRow, rows, summary] = await Promise.all([
    dbClient.queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total ${ORDER_FROM} WHERE ${where}`,
      params,
    ),
    dbClient.query<OrderDbRow>(
      `SELECT ${ORDER_SELECT} ${ORDER_FROM}
        WHERE ${where}
        ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ),
    getPaymentSummary(),
  ]);

  return {
    ...toPageResult(rows.map(mapOrder), Number(countRow?.total ?? 0), page, pageSize),
    summary,
  };
}

export async function refundAdminOrder(
  adminId: number,
  orderId: number,
  reason: string | undefined,
  ip?: string | null,
): Promise<AdminOrderRow> {
  let userId = 0;
  let orderNo = '';
  await dbClient.transaction(async (conn) => {
    const order = await queryOneOn<{
      id: number;
      orderNo: string;
      userId: number;
      bizType: 'vip' | 'unlock';
      status: OrderStatus;
      amountCents: number;
    }>(
      conn,
      `SELECT id, order_no AS orderNo, user_id AS userId, biz_type AS bizType,
              status, amount_cents AS amountCents
         FROM pay_order WHERE id = ? FOR UPDATE`,
      [orderId],
    );
    if (!order) {
      throw new HttpError(404, '订单不存在');
    }
    if (order.bizType !== 'vip') {
      throw new HttpError(400, '积分解锁订单暂不支持退款');
    }
    if (order.status !== 'paid') {
      throw new HttpError(400, '仅已支付的会员订单可退款');
    }

    userId = Number(order.userId);
    orderNo = order.orderNo;
    const refundReason = reason?.trim() || '管理员操作退款';
    await conn.query(
      `UPDATE pay_order SET status = 'refunded', refund_at = NOW(), refund_reason = ?
        WHERE id = ?`,
      [refundReason, orderId],
    );
    await conn.query(
      `UPDATE \`user\` SET role = 'member', vip_expire_at = NULL
        WHERE id = ? AND role <> 'admin'`,
      [userId],
    );
    await conn.query(
      `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'benefit', '会员订单已退款', ?)`,
      [userId, `订单 ${order.orderNo} 已退款，付费会员权益已同步收回。`],
    );
  });

  await logAdminOp(
    adminId,
    'order.refund',
    'order',
    orderId,
    { orderNo, userId, reason: reason?.trim() || '管理员操作退款' },
    ip,
  );

  const row = await dbClient.queryOne<OrderDbRow>(
    `SELECT ${ORDER_SELECT} ${ORDER_FROM} WHERE o.id = ? LIMIT 1`,
    [orderId],
  );
  if (!row) {
    throw new HttpError(500, '退款后订单读取失败');
  }
  return mapOrder(row);
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** 按当前筛选条件导出全部订单，写入操作日志。 */
export async function exportAdminOrders(
  adminId: number,
  filter: OrderFilter,
  ip?: string | null,
): Promise<{ csv: string; filename: string; count: number }> {
  const { where, params } = buildOrderWhere(filter);
  const rows = await dbClient.query<OrderDbRow>(
    `SELECT ${ORDER_SELECT} ${ORDER_FROM}
      WHERE ${where}
      ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC`,
    params,
  );

  const header = ['订单号', '用户', '业务', '图集/套餐', '支付方式', '金额', '状态', '支付时间'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.orderNo,
        `${row.nickname} <${row.email}>`,
        row.bizType === 'vip' ? '会员开通' : '积分解锁',
        row.bizType === 'vip' ? (row.planName ?? '付费会员') : (row.albumTitle ?? ''),
        row.payType === 'alipay' ? '支付宝' : row.payType === 'points' ? `${row.pointsCost} 积分` : '管理员赠送',
        row.amountCents > 0
          ? `¥${(Number(row.amountCents) / 100).toFixed(2)}`
          : row.pointsCost > 0
            ? `${row.pointsCost} 分`
            : '¥0.00',
        row.status === 'paid' ? '已支付' : row.status === 'created' ? '待支付' : row.status === 'refunded' ? '已退款' : '已关闭',
        row.paidAt ?? '',
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];

  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  const filename = `sylvie-pay-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
  await logAdminOp(
    adminId,
    'pay.export',
    'order',
    null,
    { count: rows.length, from: filter.from ?? null, to: filter.to ?? null },
    ip,
  );

  return { csv: '\uFEFF' + lines.join('\n'), filename, count: rows.length };
}
