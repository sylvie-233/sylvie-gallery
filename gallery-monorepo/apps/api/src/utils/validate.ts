import type { z } from 'zod';

/** 把 Zod 错误压成一条中文提示。 */
export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) {
    return '请求参数不合法';
  }
  const path = first.path.join('.');
  return path ? `${path}: ${first.message}` : first.message;
}
