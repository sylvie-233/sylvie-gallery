import { z } from '@hono/zod-openapi';

export const albumListSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
  sort: z.enum(['new', 'hot', 'fav']).optional(),
  tag: z.string().trim().max(32).optional(),
  keyword: z.string().trim().max(64).optional(),
  authorId: z.coerce.number().int().positive().optional(),
});

export const commentSchema = z.object({
  content: z.string().trim().min(1, '评论内容不能为空').max(500, '评论最多 500 个字符'),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  replyToUserId: z.coerce.number().int().positive().nullable().optional(),
});

export const authorListSchema = z.object({
  keyword: z.string().trim().max(32).optional(),
});

export const authorDetailSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(36).optional(),
});

export const feedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(36).default(24),
});

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
