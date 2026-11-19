import { z } from '@hono/zod-openapi';

export const trendSchema = z.object({
  mode: z.enum(['7d', '30d', '6m']).default('7d'),
});

export const logListSchema = z.object({
  action: z.string().trim().max(64).optional(),
  keyword: z.string().trim().max(128).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

export const uploadBodySchema = z.object({
  file: z.any().openapi({ type: 'string', format: 'binary' }),
  kind: z.enum(['image', 'video', 'avatar']).default('image'),
});

export type TrendInput = z.infer<typeof trendSchema>;
export type LogListInput = z.infer<typeof logListSchema>;
