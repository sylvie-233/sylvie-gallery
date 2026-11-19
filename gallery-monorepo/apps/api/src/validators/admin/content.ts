/**
 * 后台评论与公告的请求参数校验。
 */
import { z } from '@hono/zod-openapi';

/** 评论筛选：status 为审核状态，from/to 为 YYYY-MM-DD 日期。 */
export const commentListSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  keyword: z.string().trim().max(64).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

/** 审核只接受 approved/rejected，不允许回退到 pending。 */
export const commentReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

/** 公告筛选：type/status 为字符串，主要用于后台列表条件组合。 */
export const announcementListSchema = z.object({
  type: z.string().trim().max(16).optional(),
  status: z.string().trim().max(4).optional(),
  keyword: z.string().trim().max(128).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

/** 公告类型枚举 update/activity/maintain/rule/notice；标题 ≤128，正文 ≤20000。 */
export const announcementSaveSchema = z.object({
  type: z.enum(['update', 'activity', 'maintain', 'rule', 'notice']),
  title: z.string().trim().min(1, '请输入标题').max(128, '标题最多 128 个字符'),
  summary: z.string().max(255).optional(),
  content: z.string().max(20000).optional(),
  isTop: z.coerce.boolean().optional(),
});

export type CommentListInput = z.infer<typeof commentListSchema>;
export type CommentReviewInput = z.infer<typeof commentReviewSchema>;
export type AnnouncementListInput = z.infer<typeof announcementListSchema>;
export type AnnouncementSaveInput = z.infer<typeof announcementSaveSchema>;
