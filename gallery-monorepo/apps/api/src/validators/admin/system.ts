/**
 * 后台看板、操作日志与文件上传的请求参数校验。
 */
import { z } from '@hono/zod-openapi';

/** 趋势区间：7 天 / 30 天 / 6 个月，默认 7d。 */
export const trendSchema = z.object({
  mode: z.enum(['7d', '30d', '6m']).default('7d'),
});

/** 日志筛选：action 动作名、keyword 关键字，from/to 为 YYYY-MM-DD 日期。 */
export const logListSchema = z.object({
  action: z.string().trim().max(64).optional(),
  keyword: z.string().trim().max(128).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

/** 上传表单：file 为 multipart 文件，kind 决定存储目录与处理方式，默认 image。 */
export const uploadBodySchema = z.object({
  file: z.any().openapi({ type: 'string', format: 'binary' }),
  kind: z.enum(['image', 'video', 'avatar']).default('image'),
});

export type TrendInput = z.infer<typeof trendSchema>;
export type LogListInput = z.infer<typeof logListSchema>;
