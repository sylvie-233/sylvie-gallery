import { z } from '@hono/zod-openapi';

export const albumListSchema = z.object({
  status: z.enum(['all', 'published', 'draft', 'offline']).optional(),
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

export const mediaSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  url: z.string().trim().min(1).max(512),
  thumbUrl: z.string().trim().max(512).nullable().optional(),
  watermarkUrl: z.string().trim().max(512).nullable().optional(),
  width: z.coerce.number().int().positive().nullable().optional(),
  height: z.coerce.number().int().positive().nullable().optional(),
  duration: z.coerce.number().int().nonnegative().nullable().optional(),
  size: z.coerce.number().nonnegative().optional(),
});

export const albumSaveSchema = z.object({
  title: z.string().trim().min(1, '请输入标题').max(60, '标题最多 60 个字符'),
  authorId: z.coerce.number().int().positive(),
  points: z.coerce.number().int().min(0).max(99).default(0),
  description: z.string().max(1000).optional(),
  tagIds: z.array(z.coerce.number().int().positive()).max(8).default([]),
  coverUrl: z.string().trim().max(512).nullable().optional(),
  status: z.enum(['draft', 'published', 'offline']).optional(),
  images: z.array(mediaSchema).max(99).default([]),
  videos: z.array(mediaSchema).max(3).default([]),
});

export const albumStatusInputSchema = z.object({
  status: z.enum(['published', 'offline']),
});

export const tagListSchema = z.object({
  status: z.enum(['all', 'on', 'off']).optional(),
  keyword: z.string().trim().max(32).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const tagNameSchema = z.object({
  name: z.string().trim().min(1, '请输入标签名').max(20, '标签名最多 20 个字符'),
});

export const authorListSchema = z.object({
  status: z.enum(['all', 'on', 'off']).optional(),
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const authorInputSchema = z.object({
  name: z.string().trim().min(1, '请输入作者名').max(32, '作者名最多 32 个字符'),
  alias: z.string().trim().max(64).optional(),
  initial: z.string().trim().max(8).optional(),
  color: z.string().trim().max(16).optional(),
  avatarUrl: z.string().trim().max(512).nullable().optional(),
  bio: z.string().max(500).optional(),
  styleTags: z.array(z.string().trim().max(16)).max(8).optional(),
  sortWeight: z.coerce.number().int().min(-9999).max(9999).optional(),
});

export type AlbumListInput = z.infer<typeof albumListSchema>;
export type AlbumSaveInput = z.infer<typeof albumSaveSchema>;
export type AlbumStatusInput = z.infer<typeof albumStatusInputSchema>;
export type TagListInput = z.infer<typeof tagListSchema>;
export type TagNameInput = z.infer<typeof tagNameSchema>;
export type AuthorListInput = z.infer<typeof authorListSchema>;
export type AuthorInput = z.infer<typeof authorInputSchema>;
