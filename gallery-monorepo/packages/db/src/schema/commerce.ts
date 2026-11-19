import { sql } from 'drizzle-orm';
import {
  bigint,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  smallint,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/** 会员套餐：v1 仅月卡；价格以「分」为单位避免浮点误差。 */
export const membershipPlan = mysqlTable(
  'membership_plan',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    priceCents: int('price_cents', { unsigned: true }).notNull(),
    durationDays: smallint('duration_days', { unsigned: true }).notNull().default(30),
    benefits: varchar('benefits', { length: 1000 }),
    status: tinyint('status', { unsigned: true }).notNull().default(1),
  },
  (table) => [uniqueIndex('uk_code').on(table.code)],
);

/** 支付订单：会员开通/续费与积分解锁；管理员赠送会员走 pay_type='admin' 的 0 元单。 */
export const payOrder = mysqlTable(
  'pay_order',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    orderNo: varchar('order_no', { length: 32 }).notNull(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    bizType: mysqlEnum('biz_type', ['vip', 'unlock']).notNull(),
    planId: bigint('plan_id', { mode: 'number', unsigned: true }),
    albumId: bigint('album_id', { mode: 'number', unsigned: true }),
    payType: mysqlEnum('pay_type', ['alipay', 'points', 'admin']).notNull().default('alipay'),
    amountCents: int('amount_cents', { unsigned: true }).notNull().default(0),
    pointsCost: int('points_cost', { unsigned: true }).notNull().default(0),
    vipDays: smallint('vip_days', { unsigned: true }).notNull().default(0),
    status: mysqlEnum('status', ['created', 'paid', 'closed', 'refunded'])
      .notNull()
      .default('created'),
    tradeNo: varchar('trade_no', { length: 64 }),
    paidAt: datetime('paid_at', { mode: 'string' }),
    refundAt: datetime('refund_at', { mode: 'string' }),
    refundReason: varchar('refund_reason', { length: 255 }),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('uk_order_no').on(table.orderNo),
    index('idx_user_biz').on(table.userId, table.bizType, table.status, table.paidAt),
    index('idx_status_paid').on(table.status, table.paidAt),
    index('idx_album').on(table.albumId),
  ],
);
