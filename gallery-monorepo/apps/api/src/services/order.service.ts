import type {
  MembershipPlanDto,
  OrderDto,
  PurchaseData,
  UnlockDto,
  VipOrderResult,
} from '@sylvie/types';

import { env } from '../config/env.js';
import { dbClient, queryOneOn } from '../db/index.js';
import {
  activateVipAfterPayment,
  countAlbumUnlocks,
  countPaidVipOrders,
  deductUserPoints,
  insertAlbumUnlock,
  insertAlbumUnlockedNotification,
  insertOrderPaidNotification,
  insertUnlockOrder,
  insertVipOrder,
  markOrderPaid,
  selectAlbumForUnlockForUpdate,
  selectAlbumUnlock,
  selectAlbumUnlocks,
  selectOrderById,
  selectOrderByNo,
  selectPaidVipOrders,
  selectPayOrderForUpdate,
  selectPlanByCode,
  selectPlans,
  selectPurchaseOverview,
  selectUserForUnlockForUpdate,
  type OrderRow,
  type PayOrderLockRow,
  type PlanRow,
  type PurchaseOverviewRow,
  type UnlockAlbumRow,
  type UnlockRow,
  type UnlockUserRow,
} from '../sql/order.sql.js';
import type { AuthUser } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { createOrderNo, effectiveRole, normalizePage, toNumber, toPageResult } from '../utils/format.js';
import { getAlbumCardsByIds } from './album.service.js';

function mapOrder(row: OrderRow): OrderDto {
  return {
    id: Number(row.id),
    orderNo: row.orderNo,
    bizType: row.bizType,
    payType: row.payType,
    amountCents: Number(row.amountCents),
    pointsCost: Number(row.pointsCost),
    vipDays: Number(row.vipDays),
    status: row.status,
    planName: row.planName,
    albumId: row.albumId === null ? null : Number(row.albumId),
    albumTitle: row.albumTitle,
    tradeNo: row.tradeNo,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
  };
}

export async function listPlans(): Promise<MembershipPlanDto[]> {
  const statement = selectPlans();
  const rows = await dbClient.query<PlanRow>(statement.sql, statement.params);

  return rows.map((row) => {
    let benefits: string[] = [];
    try {
      const parsed: unknown = JSON.parse(row.benefits ?? '[]');
      if (Array.isArray(parsed)) {
        benefits = parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      benefits = [];
    }
    return {
      id: Number(row.id),
      code: row.code,
      name: row.name,
      priceCents: Number(row.priceCents),
      durationDays: Number(row.durationDays),
      benefits,
      status: Number(row.status),
    };
  });
}

async function getOrderByNo(orderNo: string, userId?: number): Promise<OrderDto | null> {
  const statement = selectOrderByNo(orderNo, userId);
  const row = await dbClient.queryOne<OrderRow>(statement.sql, statement.params);
  return row ? mapOrder(row) : null;
}

/** 创建付费会员订单（v1 仅支付宝；本地开发可用模拟支付确认）。 */
export async function createVipOrder(
  userId: number,
  planCode: string,
): Promise<VipOrderResult> {
  const planStatement = selectPlanByCode(planCode);
  const plan = await dbClient.queryOne<PlanRow>(planStatement.sql, planStatement.params);
  if (!plan) {
    throw new HttpError(404, '会员套餐不存在或已下架');
  }

  const orderNo = createOrderNo();
  const insertStatement = insertVipOrder({
    orderNo,
    userId,
    planId: plan.id,
    amountCents: plan.priceCents,
    vipDays: plan.durationDays,
  });
  const result = await dbClient.execute(insertStatement.sql, insertStatement.params);
  const orderId = result.insertId;
  const orderStatement = selectOrderById(orderId);
  const order = await dbClient.queryOne<OrderRow>(orderStatement.sql, orderStatement.params);
  if (!order) {
    throw new HttpError(500, '订单创建失败，请稍后重试');
  }

  return {
    order: mapOrder(order),
    payment: {
      provider: 'alipay',
      mock: env.ALIPAY_MOCK,
      payUrl: env.ALIPAY_MOCK ? `/api/orders/${orderNo}/pay` : null,
      message: env.ALIPAY_MOCK
        ? '当前为模拟支付宝支付，确认后将直接视为支付成功'
        : '请使用支付宝完成支付',
    },
  };
}

/** 模拟支付回调：仅开发/演示环境可用。 */
export async function payOrder(orderNo: string, userId: number): Promise<OrderDto> {
  if (!env.ALIPAY_MOCK) {
    throw new HttpError(
      501,
      '真实支付宝支付尚未配置（需商户号与回调地址），请设置 ALIPAY_MOCK=true 进行本地演示',
    );
  }

  await dbClient.transaction(async (conn) => {
    const orderStatement = selectPayOrderForUpdate(orderNo);
    const order = await queryOneOn<PayOrderLockRow>(
      conn,
      orderStatement.sql,
      orderStatement.params,
    );

    if (!order) {
      throw new HttpError(404, '订单不存在');
    }
    if (Number(order.userId) !== userId) {
      throw new HttpError(403, '无权操作该订单');
    }
    if (order.status === 'paid') {
      return;
    }
    if (order.status !== 'created') {
      throw new HttpError(400, '订单状态不允许支付');
    }

    const paidStatement = markOrderPaid(`MOCK${Date.now()}`, order.id);
    await conn.query(paidStatement.sql, paidStatement.params);

    if (order.bizType === 'vip') {
      const vipStatement = activateVipAfterPayment(order.vipDays, userId);
      await conn.query(vipStatement.sql, vipStatement.params);
    }

    const notificationStatement = insertOrderPaidNotification(
      userId,
      order.bizType === 'vip' ? '付费会员开通成功' : '订单支付成功',
      order.bizType === 'vip'
        ? `${order.planName ?? '付费会员'}已生效，续费天数会在剩余有效期上叠加。`
        : `订单 ${orderNo} 已支付成功。`,
    );
    await conn.query(notificationStatement.sql, notificationStatement.params);
  });

  const order = await getOrderByNo(orderNo, userId);
  if (!order) {
    throw new HttpError(404, '订单不存在');
  }
  return order;
}

/** 使用积分解锁单套图集；付费会员与管理员无需解锁。 */
export async function unlockAlbum(
  userId: number,
  albumId: number,
): Promise<{ access: boolean; already: boolean; pointsCost: number; points: number }> {
  return dbClient.transaction(async (conn) => {
    const userStatement = selectUserForUnlockForUpdate(userId);
    const user = await queryOneOn<UnlockUserRow>(
      conn,
      userStatement.sql,
      userStatement.params,
    );
    if (!user) {
      throw new HttpError(404, '用户不存在');
    }

    const albumStatement = selectAlbumForUnlockForUpdate(albumId);
    const album = await queryOneOn<UnlockAlbumRow>(
      conn,
      albumStatement.sql,
      albumStatement.params,
    );
    if (!album) {
      throw new HttpError(404, '图集不存在或已下架');
    }

    const role = effectiveRole(user.role, user.vipExpireAt);
    const unlockStatement = selectAlbumUnlock(userId, albumId);
    const existing = await queryOneOn<{ id: number }>(
      conn,
      unlockStatement.sql,
      unlockStatement.params,
    );

    if (role === 'vip' || role === 'admin' || existing) {
      return {
        access: true,
        already: true,
        pointsCost: 0,
        points: Number(user.points),
      };
    }

    const required = Number(album.points);
    if (required <= 0) {
      throw new HttpError(400, '该图集未开放积分解锁');
    }
    if (Number(user.points) < required) {
      throw new HttpError(400, `解锁积分不足，还需 ${required - Number(user.points)} 积分`);
    }

    const orderNo = createOrderNo();
    const orderStatement = insertUnlockOrder({ orderNo, userId, albumId, pointsCost: required });
    const [orderResult] = await conn.query(orderStatement.sql, orderStatement.params);
    const orderId = (orderResult as { insertId: number }).insertId;

    const unlockRecordStatement = insertAlbumUnlock({
      userId,
      albumId,
      orderId,
      pointsCost: required,
    });
    await conn.query(unlockRecordStatement.sql, unlockRecordStatement.params);

    const deductStatement = deductUserPoints(required, userId);
    await conn.query(deductStatement.sql, deductStatement.params);

    const notificationStatement = insertAlbumUnlockedNotification(
      userId,
      `《${album.title}》已解锁，可在线查看全部图片并下载原图。`,
      albumId,
    );
    await conn.query(notificationStatement.sql, notificationStatement.params);

    return {
      access: true,
      already: false,
      pointsCost: required,
      points: Number(user.points) - required,
    };
  });
}

/** 我的购买：概览 + 会员订单 + 图集解锁（各自分页）。 */
export async function getPurchases(
  userId: number,
  ordersPage = 1,
  unlocksPage = 1,
  pageSize = 6,
): Promise<PurchaseData> {
  const orderPage = normalizePage(ordersPage, pageSize, 6);
  const unlockPage = normalizePage(unlocksPage, pageSize, 6);

  const [overviewStatement, orderCountStatement, unlockCountStatement] = [
    selectPurchaseOverview(userId),
    countPaidVipOrders(userId),
    countAlbumUnlocks(userId),
  ];
  const [overviewRow, orderCountRow, unlockCountRow] = await Promise.all([
    dbClient.queryOne<PurchaseOverviewRow>(overviewStatement.sql, overviewStatement.params),
    dbClient.queryOne<{ total: number }>(orderCountStatement.sql, orderCountStatement.params),
    dbClient.queryOne<{ total: number }>(unlockCountStatement.sql, unlockCountStatement.params),
  ]);

  const ordersTotal = Number(orderCountRow?.total ?? 0);
  const unlocksTotal = Number(unlockCountRow?.total ?? 0);

  const orderListStatement = selectPaidVipOrders(userId, orderPage.pageSize, orderPage.offset);
  const unlockListStatement = selectAlbumUnlocks(userId, unlockPage.pageSize, unlockPage.offset);
  const [orderRows, unlockRows] = await Promise.all([
    dbClient.query<OrderRow>(orderListStatement.sql, orderListStatement.params),
    dbClient.query<UnlockRow>(unlockListStatement.sql, unlockListStatement.params),
  ]);

  const cards = await getAlbumCardsByIds(
    unlockRows.map((row) => Number(row.albumId)),
    userId,
  );
  const unlocks: UnlockDto[] = [];
  for (const row of unlockRows) {
    const card = cards.get(Number(row.albumId));
    if (card) {
      unlocks.push({
        id: Number(row.id),
        album: card,
        pointsCost: Number(row.pointsCost),
        createdAt: row.createdAt,
      });
    }
  }

  const orderPageResult = toPageResult(orderRows.map(mapOrder), ordersTotal, orderPage.page, orderPage.pageSize);
  const unlockPageResult = toPageResult(unlocks, unlocksTotal, unlockPage.page, unlockPage.pageSize);

  return {
    overview: {
      totalSpentCents: toNumber(overviewRow?.totalSpent),
      vipOrderCount: Number(overviewRow?.vipOrders ?? 0),
      unlockedCount: unlocksTotal,
    },
    orders: orderPageResult.list,
    ordersTotal: orderPageResult.total,
    ordersPage: orderPageResult.page,
    ordersPageSize: orderPageResult.pageSize,
    ordersTotalPages: orderPageResult.totalPages,
    unlocks: unlockPageResult.list,
    unlocksTotal: unlockPageResult.total,
    unlocksPage: unlockPageResult.page,
    unlocksPageSize: unlockPageResult.pageSize,
    unlocksTotalPages: unlockPageResult.totalPages,
  };
}

/** 仅内部使用：判断用户是否为有效付费会员。 */
export function isEffectiveVip(user: AuthUser | undefined): boolean {
  if (!user) {
    return false;
  }
  return effectiveRole(user.role, user.vipExpireAt) === 'vip' || user.role === 'admin';
}
