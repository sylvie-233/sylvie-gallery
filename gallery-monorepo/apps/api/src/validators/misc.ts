/**
 * 前台杂项请求校验：公告、通知、会员订单与「我的购买」查询。
 */
import { z } from '@hono/zod-openapi';

export const announcementListSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
  // 关键词同时匹配标题、摘要、正文与类型名称。
  keyword: z.string().trim().max(64).optional(),
});

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(24).optional(),
  // all=全部，unread=仅未读；未传时按全部处理。
  filter: z.enum(['all', 'unread']).optional(),
});

export const createVipSchema = z.object({
  // 对应 sys_config / membership_plan.code，如 monthly / quarterly。
  planCode: z.string().trim().min(1, '请选择会员套餐').max(32),
});

// 「我的购买」一次返回订单与解锁记录两份分页，各自维护页码，共用一个 pageSize。
export const purchasesQuerySchema = z.object({
  ordersPage: z.coerce.number().int().min(1).optional(),
  unlocksPage: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(24).optional(),
});

export type AnnouncementListInput = z.infer<typeof announcementListSchema>;
export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;
export type CreateVipInput = z.infer<typeof createVipSchema>;
export type PurchasesQueryInput = z.infer<typeof purchasesQuerySchema>;
