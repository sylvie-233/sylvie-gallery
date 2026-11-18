import type {
  MembershipPlanDto,
  OrderDto,
  OrderStatus,
  PayType,
  PurchaseData,
  UnlockDto,
  VipOrderResult,
} from '@sylvie/types';

import { env } from '../config/env.js';
import { dbClient, queryOneOn } from '../db/index.js';
import type { AuthUser } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { createOrderNo, effectiveRole, normalizePage, toNumber, toPageResult } from '../utils/format.js';
import { getAlbumCardsByIds } from './album.service.js';

interface PlanRow {
  id: number;
  code: string;
  name: string;
  priceCents: number;
  durationDays: number;
  benefits: string | null;
  status: number;
}

interface OrderRow {
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

const ORDER_SELECT = `o.id, o.order_no AS orderNo, o.biz_type AS bizType, o.pay_type AS payType,
  o.amount_cents AS amountCents, o.points_cost AS pointsCost, o.vip_days AS vipDays,
  o.status, p.name AS planName, o.album_id AS albumId, a.title AS albumTitle,
  o.trade_no AS tradeNo, o.paid_at AS paidAt, o.created_at AS createdAt`;
const ORDER_FROM = `FROM pay_order o
  LEFT JOIN membership_plan p ON p.id = o.plan_id
  LEFT JOIN album a ON a.id = o.album_id`;

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
  const rows = await dbClient.query<PlanRow>(
    `SELECT id, code, name, price_cents AS priceCents, duration_days AS durationDays,
            benefits, status
       FROM membership_plan
      WHERE status = 1
      ORDER BY price_cents ASC, id ASC`,
  );

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
  const params: unknown[] = [orderNo];
  let owner = '';
  if (userId !== undefined) {
    owner = 'AND o.user_id = ?';
    params.push(userId);
  }
  const row = await dbClient.queryOne<OrderRow>(
    `SELECT ${ORDER_SELECT} ${ORDER_FROM} WHERE o.order_no = ? ${owner} LIMIT 1`,
    params,
  );
  return row ? mapOrder(row) : null;
}

/** 创建付费会员订单（v1 仅支付宝；本地开发可用模拟支付确认）。 */
export async function createVipOrder(
  userId: number,
  planCode: string,
): Promise<VipOrderResult> {
  const plan = await dbClient.queryOne<PlanRow>(
    `SELECT id, code, name, price_cents AS priceCents, duration_days AS durationDays,
            benefits, status
       FROM membership_plan WHERE code = ? AND status = 1 LIMIT 1`,
    [planCode],
  );
  if (!plan) {
    throw new HttpError(404, '会员套餐不存在或已下架');
  }

  const orderNo = createOrderNo();
  const [result] = await dbClient.pool.query(
    `INSERT INTO pay_order (order_no, user_id, biz_type, plan_id, pay_type, amount_cents, vip_days, status)
     VALUES (?, ?, 'vip', ?, 'alipay', ?, ?, 'created')`,
    [orderNo, userId, plan.id, plan.priceCents, plan.durationDays],
  );
  const orderId = (result as { insertId: number }).insertId;
  const order = await dbClient.queryOne<OrderRow>(
    `SELECT ${ORDER_SELECT} ${ORDER_FROM} WHERE o.id = ? LIMIT 1`,
    [orderId],
  );
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
    const order = await queryOneOn<{
      id: number;
      userId: number;
      bizType: 'vip' | 'unlock';
      status: OrderStatus;
      vipDays: number;
      amountCents: number;
      planName: string | null;
    }>(
      conn,
      `SELECT o.id, o.user_id AS userId, o.biz_type AS bizType, o.status,
              o.vip_days AS vipDays, o.amount_cents AS amountCents, p.name AS planName
         FROM pay_order o
         LEFT JOIN membership_plan p ON p.id = o.plan_id
        WHERE o.order_no = ?
        FOR UPDATE`,
      [orderNo],
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

    await conn.query(
      `UPDATE pay_order SET status = 'paid', trade_no = ?, paid_at = NOW() WHERE id = ?`,
      [`MOCK${Date.now()}`, order.id],
    );

    if (order.bizType === 'vip') {
      await conn.query(
        `UPDATE \`user\`
            SET role = IF(role = 'admin', 'admin', 'vip'),
                vip_expire_at = DATE_ADD(GREATEST(COALESCE(vip_expire_at, NOW()), NOW()), INTERVAL ? DAY)
          WHERE id = ?`,
        [order.vipDays, userId],
      );
    }

    await conn.query(
      `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'benefit', ?, ?)`,
      [
        userId,
        order.bizType === 'vip' ? '付费会员开通成功' : '订单支付成功',
        order.bizType === 'vip'
          ? `${order.planName ?? '付费会员'}已生效，续费天数会在剩余有效期上叠加。`
          : `订单 ${orderNo} 已支付成功。`,
      ],
    );
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
    const user = await queryOneOn<{
      points: number;
      role: 'member' | 'vip' | 'admin';
      vipExpireAt: string | null;
    }>(
      conn,
      `SELECT points, role, vip_expire_at AS vipExpireAt
         FROM \`user\` WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
      [userId],
    );
    if (!user) {
      throw new HttpError(404, '用户不存在');
    }

    const album = await queryOneOn<{ id: number; title: string; points: number }>(
      conn,
      `SELECT id, title, points FROM album
        WHERE id = ? AND status = 'published' AND is_deleted = 0
        FOR UPDATE`,
      [albumId],
    );
    if (!album) {
      throw new HttpError(404, '图集不存在或已下架');
    }

    const role = effectiveRole(user.role, user.vipExpireAt);
    const existing = await queryOneOn<{ id: number }>(
      conn,
      `SELECT id FROM album_unlock WHERE user_id = ? AND album_id = ? LIMIT 1`,
      [userId, albumId],
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
    const [orderResult] = await conn.query(
      `INSERT INTO pay_order (order_no, user_id, biz_type, album_id, pay_type, amount_cents, points_cost, status, paid_at)
       VALUES (?, ?, 'unlock', ?, 'points', 0, ?, 'paid', NOW())`,
      [orderNo, userId, albumId, required],
    );
    const orderId = (orderResult as { insertId: number }).insertId;

    await conn.query(
      `INSERT INTO album_unlock (user_id, album_id, order_id, points_cost) VALUES (?, ?, ?, ?)`,
      [userId, albumId, orderId, required],
    );
    await conn.query(`UPDATE \`user\` SET points = points - ? WHERE id = ?`, [required, userId]);
    await conn.query(
      `INSERT INTO user_notification (user_id, type, title, content, album_id)
       VALUES (?, 'benefit', '图集解锁成功', ?, ?)`,
      [userId, `《${album.title}》已解锁，可在线查看全部图片并下载原图。`, albumId],
    );

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

  const [overviewRow, orderCountRow, unlockCountRow] = await Promise.all([
    dbClient.queryOne<{ totalSpent: number; vipOrders: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS totalSpent,
              SUM(CASE WHEN biz_type = 'vip' THEN 1 ELSE 0 END) AS vipOrders
         FROM pay_order WHERE user_id = ? AND status = 'paid'`,
      [userId],
    ),
    dbClient.queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM pay_order
        WHERE user_id = ? AND status = 'paid' AND biz_type = 'vip'`,
      [userId],
    ),
    dbClient.queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM album_unlock WHERE user_id = ?`,
      [userId],
    ),
  ]);

  const ordersTotal = Number(orderCountRow?.total ?? 0);
  const unlocksTotal = Number(unlockCountRow?.total ?? 0);

  const [orderRows, unlockRows] = await Promise.all([
    dbClient.query<OrderRow>(
      `SELECT ${ORDER_SELECT} ${ORDER_FROM}
        WHERE o.user_id = ? AND o.status = 'paid' AND o.biz_type = 'vip'
        ORDER BY o.paid_at DESC, o.id DESC
        LIMIT ? OFFSET ?`,
      [userId, orderPage.pageSize, orderPage.offset],
    ),
    dbClient.query<{ id: number; albumId: number; pointsCost: number; createdAt: string }>(
      `SELECT id, album_id AS albumId, points_cost AS pointsCost, created_at AS createdAt
         FROM album_unlock
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      [userId, unlockPage.pageSize, unlockPage.offset],
    ),
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
