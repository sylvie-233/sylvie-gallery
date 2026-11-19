import { z } from '@hono/zod-openapi';

import { AlbumCardSchema } from './album.js';
import { pageResult, orderStatusSchema, payTypeSchema } from './common.js';
import { MembershipPlanSchema } from './content.js';

/** 订单。 */
export const OrderSchema = z
  .object({
    id: z.number().int(),
    orderNo: z.string(),
    bizType: z.enum(['vip', 'unlock']),
    payType: payTypeSchema,
    amountCents: z.number().int(),
    pointsCost: z.number().int(),
    vipDays: z.number().int(),
    status: orderStatusSchema,
    planName: z.string().nullable(),
    albumId: z.number().int().nullable(),
    albumTitle: z.string().nullable(),
    tradeNo: z.string().nullable(),
    paidAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Order');

/** 图集解锁记录。 */
export const UnlockSchema = z
  .object({
    id: z.number().int(),
    album: AlbumCardSchema,
    pointsCost: z.number().int(),
    createdAt: z.string(),
  })
  .openapi('Unlock');

/** 我的购买概览。 */
export const PurchaseOverviewSchema = z
  .object({
    totalSpentCents: z.number().int(),
    vipOrderCount: z.number().int(),
    unlockedCount: z.number().int(),
  })
  .openapi('PurchaseOverview');

/** 我的购买数据。 */
export const PurchaseDataSchema = z
  .object({
    overview: PurchaseOverviewSchema,
    orders: z.array(OrderSchema),
    ordersTotal: z.number().int(),
    ordersPage: z.number().int(),
    ordersPageSize: z.number().int(),
    ordersTotalPages: z.number().int(),
    unlocks: z.array(UnlockSchema),
    unlocksTotal: z.number().int(),
    unlocksPage: z.number().int(),
    unlocksPageSize: z.number().int(),
    unlocksTotalPages: z.number().int(),
  })
  .openapi('PurchaseData');

/** 支付宝支付信息（本地开发为模拟支付）。 */
export const VipPaymentSchema = z
  .object({
    provider: z.literal('alipay'),
    mock: z.boolean(),
    payUrl: z.string().nullable(),
    message: z.string(),
  })
  .openapi('VipPayment');

/** 创建会员订单结果。 */
export const VipOrderResultSchema = z
  .object({
    order: OrderSchema,
    payment: VipPaymentSchema,
  })
  .openapi('VipOrderResult');

/** 订单分页结果。 */
export const OrderPageResultSchema = pageResult(OrderSchema).openapi('OrderPageResult');

/** 会员套餐列表。 */
export const PlanListSchema = z.array(MembershipPlanSchema);
