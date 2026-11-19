/**
 * 前台内容类响应模型：公告、通知、会员套餐、友情链接与站点初始化聚合数据。
 */
import { z } from '@hono/zod-openapi';

import { AlbumCardSchema, AuthorSchema, TagDtoSchema } from './album.js';
import { announcementTypeSchema, notificationTypeSchema, pageResult } from './common.js';

/** 公告。 */
export const AnnouncementSchema = z
  .object({
    id: z.number().int(),
    type: announcementTypeSchema,
    // 类型的中文展示名，由后端映射，前端无需维护枚举文案。
    typeLabel: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    content: z.string().nullable(),
    // 置顶公告在列表中优先展示。
    isTop: z.boolean(),
    publishedAt: z.string(),
  })
  .openapi('Announcement');

/** 公告分页结果。 */
export const AnnouncementPageResultSchema = pageResult(AnnouncementSchema).openapi(
  'AnnouncementPageResult',
);

/** 通知关联图集。 */
export const NotificationAlbumSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    coverUrl: z.string(),
    imageCount: z.number().int(),
    videoCount: z.number().int(),
    authorName: z.string(),
    publishedAt: z.string(),
  })
  .openapi('NotificationAlbum');

/** 用户通知。 */
export const NotificationSchema = z
  .object({
    id: z.number().int(),
    type: notificationTypeSchema,
    typeLabel: z.string(),
    title: z.string(),
    content: z.string(),
    // 部分通知关联具体图集（如审核结果 / 图集更新），系统通知为 null。
    album: NotificationAlbumSchema.nullable(),
    isRead: z.boolean(),
    readAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Notification');

/** 通知分页结果（附带未读数）。 */
export const NotificationPageResultSchema = pageResult(NotificationSchema)
  .extend({ unread: z.number().int() })
  .openapi('NotificationPageResult');

/** 会员套餐。 */
export const MembershipPlanSchema = z
  .object({
    id: z.number().int(),
    code: z.string(),
    name: z.string(),
    // 套餐价格，单位：分。
    priceCents: z.number().int(),
    // 会员有效天数，续费时在剩余到期时间上叠加。
    durationDays: z.number().int(),
    benefits: z.array(z.string()),
    // 1=上架，0=下架。
    status: z.number().int(),
  })
  .openapi('MembershipPlan');

/** 友情链接。 */
export const FriendLinkSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    slogan: z.string().nullable(),
    url: z.string(),
  })
  .openapi('FriendLink');

/** 前台初始化数据。 */
export const SiteBootstrapSchema = z
  .object({
    config: z.record(z.string(), z.string()),
    friendLinks: z.array(FriendLinkSchema),
    plans: z.array(MembershipPlanSchema),
    tags: z.array(TagDtoSchema),
    authors: z.array(AuthorSchema),
    latestAlbums: z.array(AlbumCardSchema),
    announcements: z.array(AnnouncementSchema),
    // 今日新增图集数、最近一次更新时间（用于「今日更新」角标）。
    todayAdded: z.number().int(),
    latestDate: z.string().nullable(),
    stats: z.object({
      albumCount: z.number().int(),
      authorCount: z.number().int(),
      imageCount: z.number().int(),
    }),
  })
  .openapi('SiteBootstrap');
