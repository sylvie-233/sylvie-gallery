/**
 * 前台图集 / 评论 / 作者 / 推荐流的查询与请求体校验。
 * 查询参数均为字符串，统一用 z.coerce 转数字并限制上限，避免大页拖垮数据库。
 */
import { z } from '@hono/zod-openapi';

export const albumListSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  // 单页上限 48，与瀑布流和大屏三列布局对齐。
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
  // new=最新（published_at 倒序）、hot=浏览量、fav=收藏数。
  sort: z.enum(['new', 'hot', 'fav']).optional(),
  tag: z.string().trim().max(32).optional(),
  keyword: z.string().trim().max(64).optional(),
  authorId: z.coerce.number().int().positive().optional(),
});

export const commentSchema = z.object({
  content: z.string().trim().min(1, '评论内容不能为空').max(500, '评论最多 500 个字符'),
  // parentId 指向父评论（构建楼中楼），replyToUserId 是被回复的用户。
  parentId: z.coerce.number().int().positive().nullable().optional(),
  replyToUserId: z.coerce.number().int().positive().nullable().optional(),
});

export const authorListSchema = z.object({
  // 关键词匹配姓名、别名或风格标签。
  keyword: z.string().trim().max(32).optional(),
});

// 作者详情内的图集分页，单页上限 36（三列网格的整行倍数）。
export const authorDetailSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(36).optional(),
});

// 推荐流：默认首屏 24 条，最多 36 条。
export const feedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(36).default(24),
});

// 「我的收藏 / 我的订阅」通用分页。
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(36).optional(),
});

export type AlbumListInput = z.infer<typeof albumListSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
export type AuthorListInput = z.infer<typeof authorListSchema>;
export type AuthorDetailInput = z.infer<typeof authorDetailSchema>;
export type FeedQueryInput = z.infer<typeof feedQuerySchema>;
export type PageQueryInput = z.infer<typeof pageQuerySchema>;
