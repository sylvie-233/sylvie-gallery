import { z } from '@hono/zod-openapi';

export const orderListSchema = z.object({
  biz: z.enum(['all', 'vip', 'unlock']).optional(),
  status: z.enum(['all', 'created', 'paid', 'refunded', 'closed']).optional(),
  keyword: z.string().trim().max(64).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

export const refundSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});

export const userListSchema = z.object({
  role: z.enum(['all', 'admin', 'vip', 'member']).optional(),
  status: z.enum(['all', '0', '1']).optional(),
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

export const pointsSchema = z.object({
  delta: z.coerce.number().int().min(-99999).max(99999),
  reason: z.string().trim().min(1, '请填写调整原因').max(64),
});

export const siteConfigSchema = z.object({
  copyright: z.string().max(255).default(''),
  icpNo: z.string().max(64).default(''),
  ageStatement: z.string().max(255).default(''),
  disclaimer: z.string().max(255).default(''),
  checkinPoints: z.coerce.number().int().min(1).max(99).default(2),
  watermarkOn: z.coerce.boolean().default(true),
});

export const planConfigSchema = z.object({
  priceCents: z.coerce.number().int().min(1).max(1000000),
  durationDays: z.coerce.number().int().min(1).max(365),
  benefits: z.array(z.string().trim().max(100)).min(1).max(12),
});

export const friendLinkSchema = z.object({
  name: z.string().trim().min(1, '请输入站名').max(32),
  slogan: z.string().trim().max(64).optional(),
  url: z.string().trim().min(1, '请输入链接').max(255),
});

export type OrderListInput = z.infer<typeof orderListSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
export type UserListInput = z.infer<typeof userListSchema>;
export type PointsInput = z.infer<typeof pointsSchema>;
export type SiteConfigInput = z.infer<typeof siteConfigSchema>;
export type PlanConfigInput = z.infer<typeof planConfigSchema>;
export type FriendLinkInput = z.infer<typeof friendLinkSchema>;
