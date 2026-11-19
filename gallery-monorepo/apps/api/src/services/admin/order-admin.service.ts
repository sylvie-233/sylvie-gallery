import type {
  AdminOrderPage,
  AdminOrderRow,
  AdminPaymentSummary,
} from '@sylvie/types';

import { dbClient, queryOneOn } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toNumber, toPageResult } from '../../utils/format.js';
import {
  buildOrderWhere,
  countAdminOrders,
  insertRefundNotification,
  revokeVipPrivilege,
  selectAdminOrders,
  selectOrderById,
  selectOrderForRefund,
  selectOrderTodayRevenue,
  selectOrderTotalRevenue,
  selectOrdersForExport,
  selectUnlockOrderStats,
  selectVipOrderStats,
  updateOrderRefund,
  type OrderFilter,
  type OrderRow,
  type PaymentTodayRow,
  type PaymentRevenueRow,
  type RefundOrderRow,
  type UnlockOrderStatsRow,
  type VipOrderStatsRow,
} from '../../sql/admin/order-admin.sql.js';
import { logAdminOp } from './log.service.js';

function mapOrder(row: OrderRow): AdminOrderRow {
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

async function getPaymentSummary(): Promise<AdminPaymentSummary> {
  const totalStatement = selectOrderTotalRevenue();
  const todayStatement = selectOrderTodayRevenue();
  const vipStatement = selectVipOrderStats();
  const unlockStatement = selectUnlockOrderStats();

  const [totalRow, todayRow, vipRow, unlockRow] = await Promise.all([
    dbClient.queryOne<PaymentRevenueRow>(totalStatement.sql, totalStatement.params),
    dbClient.queryOne<PaymentTodayRow>(todayStatement.sql, todayStatement.params),
    dbClient.queryOne<VipOrderStatsRow>(vipStatement.sql, vipStatement.params),
    dbClient.queryOne<UnlockOrderStatsRow>(unlockStatement.sql, unlockStatement.params),
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
  const where = buildOrderWhere(filter);
  const countStatement = countAdminOrders(where);
  const rowsStatement = selectAdminOrders(where, pageSize, offset);

  const [countRow, rows, summary] = await Promise.all([
    dbClient.queryOne<{ total: number }>(countStatement.sql, countStatement.params),
    dbClient.query<OrderRow>(rowsStatement.sql, rowsStatement.params),
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
    const orderStatement = selectOrderForRefund(orderId);
    const order = await queryOneOn<RefundOrderRow>(
      conn,
      orderStatement.sql,
      orderStatement.params,
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
    const refundStatement = updateOrderRefund(refundReason, orderId);
    await conn.query(refundStatement.sql, refundStatement.params);
    const revokeStatement = revokeVipPrivilege(userId);
    await conn.query(revokeStatement.sql, revokeStatement.params);
    const notificationStatement = insertRefundNotification(
      userId,
      `订单 ${order.orderNo} 已退款，付费会员权益已同步收回。`,
    );
    await conn.query(notificationStatement.sql, notificationStatement.params);
  });

  await logAdminOp(
    adminId,
    'order.refund',
    'order',
    orderId,
    { orderNo, userId, reason: reason?.trim() || '管理员操作退款' },
    ip,
  );

  const rowStatement = selectOrderById(orderId);
  const row = await dbClient.queryOne<OrderRow>(rowStatement.sql, rowStatement.params);
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
  const where = buildOrderWhere(filter);
  const exportStatement = selectOrdersForExport(where);
  const rows = await dbClient.query<OrderRow>(exportStatement.sql, exportStatement.params);

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

  return { csv: '﻿' + lines.join('\n'), filename, count: rows.length };
}
