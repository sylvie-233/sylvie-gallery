/**
 * 前台订单响应模型：订单、解锁记录、我的购买概览与会员订单创建结果。
 * 所有金额字段以「分」为单位，避免浮点误差。
 */
import { z } from '@hono/zod-openapi';

import { AlbumCardSchema } from './album.js';
import { pageResult, orderStatusSchema, payTypeSchema } from './common.js';
import { MembershipPlanSchema } from './content.js';

/** 订单。 */
export const OrderSchema = z
  .object({
    id: z.number().int(),
    orderNo: z.string(),
    // 业务类型：vip=会员开通 / 续费，unlock=积分解锁图集。
    bizType: z.enum(['vip', 'unlock']),
    payType: payTypeSchema,
    // 实付金额（分）；后台赠送订单为 0。
    amountCents: z.number().int(),
    // 积分订单消耗的解锁积分，现金订单为 0。
    pointsCost: z.number().int(),
    // 本次开通 / 续费增加的会员天数。
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
    // 该次解锁消耗的积分。
    pointsCost: z.number().int(),
    createdAt: z.string(),
  })
  .openapi('Unlock');

/** 我的购买概览。 */
export const PurchaseOverviewSchema = z
  .object({
    // 累计现金消费（分），不含积分抵扣与后台赠送。
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
    // true 表示本地模拟支付（ALIPAY_MOCK=true），无需跳转收银台。
    mock: z.boolean(),
    // 真实支付时的支付宝收银台地址；模拟支付为 null。
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
