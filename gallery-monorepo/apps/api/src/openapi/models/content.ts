import { z } from '@hono/zod-openapi';

import { AlbumCardSchema, AuthorSchema, TagDtoSchema } from './album.js';
import { announcementTypeSchema, notificationTypeSchema, pageResult } from './common.js';

/** 公告。 */
export const AnnouncementSchema = z
  .object({
    id: z.number().int(),
    type: announcementTypeSchema,
    typeLabel: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    content: z.string().nullable(),
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
    priceCents: z.number().int(),
    durationDays: z.number().int(),
    benefits: z.array(z.string()),
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
    todayAdded: z.number().int(),
    latestDate: z.string().nullable(),
    stats: z.object({
      albumCount: z.number().int(),
      authorCount: z.number().int(),
      imageCount: z.number().int(),
    }),
  })
  .openapi('SiteBootstrap');
