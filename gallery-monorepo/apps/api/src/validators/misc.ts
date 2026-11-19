import { z } from '@hono/zod-openapi';

export const announcementListSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
  keyword: z.string().trim().max(64).optional(),
});

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(24).optional(),
  filter: z.enum(['all', 'unread']).optional(),
});

export const createVipSchema = z.object({
  planCode: z.string().trim().min(1, '请选择会员套餐').max(32),
});

export const purchasesQuerySchema = z.object({
  ordersPage: z.coerce.number().int().min(1).optional(),
  unlocksPage: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(24).optional(),
});

export type AnnouncementListInput = z.infer<typeof announcementListSchema>;
export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;
export type CreateVipInput = z.infer<typeof createVipSchema>;
export type PurchasesQueryInput = z.infer<typeof purchasesQuerySchema>;
