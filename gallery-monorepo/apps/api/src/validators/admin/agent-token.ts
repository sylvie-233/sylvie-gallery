import { z } from '@hono/zod-openapi';

export const createAgentTokenSchema = z.object({
  name: z.string().trim().min(1, '请输入令牌名称').max(32, '名称最多 32 个字符'),
  scope: z.enum(['read', 'write']).default('read'),
  expiresInDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
});

export type CreateAgentTokenInput = z.infer<typeof createAgentTokenSchema>;
