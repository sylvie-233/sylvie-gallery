import { z } from '@hono/zod-openapi';

import {
  albumStatusSchema,
  commentStatusSchema,
  effectiveRoleSchema,
  mediaTypeSchema,
  pageResult,
} from './common.js';

/** 标签：图集卡片与详情共用。 */
export const TagDtoSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    useCount: z.number().int(),
  })
  .openapi('Tag');

/** 图集作者简要信息。 */
export const AlbumAuthorSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    initial: z.string(),
    color: z.string(),
    avatarUrl: z.string().nullable(),
  })
  .openapi('AlbumAuthor');

/** 图集卡片：首页、图集页、瀑布流与收藏列表共用。 */
export const AlbumCardSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    coverUrl: z.string(),
    imageCount: z.number().int(),
    videoCount: z.number().int(),
    packageSize: z.number().openapi({ description: '压缩包大小（MB）' }),
    points: z.number().int(),
    viewCount: z.number().int(),
    favCount: z.number().int(),
    commentCount: z.number().int(),
    isRecommended: z.boolean(),
    publishedAt: z.string(),
    author: AlbumAuthorSchema,
    tags: z.array(TagDtoSchema),
    favorited: z.boolean(),
  })
  .openapi('AlbumCard');

/** 图集媒体。 */
export const AlbumImageSchema = z
  .object({
    id: z.number().int(),
    mediaType: mediaTypeSchema,
    url: z.string(),
    thumbUrl: z.string().nullable(),
    watermarkUrl: z.string().nullable(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    duration: z.number().int().nullable(),
    sortOrder: z.number().int(),
  })
  .openapi('AlbumImage');

/** 评论用户。 */
export const CommentUserSchema = z
  .object({
    id: z.number().int(),
    nickname: z.string(),
    avatarType: z.number().int(),
    avatarIndex: z.number().int(),
    avatarUrl: z.string().nullable(),
    role: effectiveRoleSchema,
  })
  .openapi('CommentUser');

/** 评论 / 回复（递归）。 */
export const CommentSchema: z.ZodType<unknown> = z
  .lazy(() =>
    z
      .object({
        id: z.number().int(),
        parentId: z.number().int().nullable(),
        replyToUserId: z.number().int().nullable(),
        replyToName: z.string().nullable(),
        content: z.string(),
        status: commentStatusSchema,
        createdAt: z.string(),
        isMine: z.boolean(),
        user: CommentUserSchema,
        replies: z.array(CommentSchema),
      })
      .openapi('Comment'),
  );

/** 图集详情中的作者信息。 */
export const AlbumDetailAuthorSchema = AlbumAuthorSchema.extend({
  bio: z.string().nullable(),
  albumCount: z.number().int(),
  subscribed: z.boolean(),
}).openapi('AlbumDetailAuthor');

/** 图集详情。 */
export const AlbumDetailSchema = AlbumCardSchema.extend({
  description: z.string().nullable(),
  status: albumStatusSchema,
  author: AlbumDetailAuthorSchema,
  images: z.array(AlbumImageSchema),
  totalImages: z.number().int(),
  locked: z.boolean(),
  unlocked: z.boolean(),
  isVip: z.boolean(),
  canDownload: z.boolean(),
  previewCount: z.number().int(),
  lockedCount: z.number().int(),
  watermark: z.boolean(),
  otherWorks: z.array(AlbumCardSchema),
  comments: z.array(CommentSchema),
  commentTotal: z.number().int(),
}).openapi('AlbumDetail');

/** 作者。 */
export const AuthorSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    alias: z.string().nullable(),
    initial: z.string(),
    avatarUrl: z.string().nullable(),
    coverUrl: z.string().nullable(),
    color: z.string(),
    bio: z.string().nullable(),
    styleTags: z.array(z.string()),
    albumCount: z.number().int(),
    lastUpdateAt: z.string().nullable(),
    sortWeight: z.number().int(),
    subscribed: z.boolean(),
  })
  .openapi('Author');

/** 作者详情。 */
export const AuthorDetailSchema = z
  .object({
    author: AuthorSchema,
    albums: z.array(AlbumCardSchema),
    albumTotal: z.number().int(),
    albumPage: z.number().int(),
    albumPageSize: z.number().int(),
    albumTotalPages: z.number().int(),
  })
  .openapi('AuthorDetail');

/** 收藏 / 取消收藏结果。 */
export const FavoriteResultSchema = z
  .object({
    favorited: z.boolean(),
    favCount: z.number().int(),
  })
  .openapi('FavoriteResult');

/** 图集解锁结果。 */
export const UnlockResultSchema = z
  .object({
    access: z.boolean(),
    already: z.boolean(),
    pointsCost: z.number().int(),
    points: z.number().int(),
  })
  .openapi('UnlockResult');

/** 订阅 / 取消订阅结果。 */
export const SubscriptionResultSchema = z
  .object({ subscribed: z.boolean() })
  .openapi('SubscriptionResult');

/** 图集分页结果。 */
export const AlbumPageResultSchema = pageResult(AlbumCardSchema).openapi('AlbumPageResult');

/** 作者分页结果（我的订阅）。 */
export const AuthorPageResultSchema = pageResult(AuthorSchema).openapi('AuthorPageResult');
