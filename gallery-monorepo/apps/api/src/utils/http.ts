import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { ApiResponse } from '@sylvie/types';

/** 业务异常：由全局错误中间件转换为统一响应。 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** 统一成功响应。 */
export function success(
  c: Context,
  data: unknown,
  message = '操作成功',
  status: ContentfulStatusCode = 200,
): Response {
  const body: ApiResponse<unknown> = { code: 200, message, data };
  return c.body(JSON.stringify(body), status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
}

/** 统一失败响应（供中间件直接使用）。 */
export function failure(c: Context, status: number, message: string): Response {
  return c.body(
    JSON.stringify({ code: status, message, data: null }),
    status as ContentfulStatusCode,
    { 'Content-Type': 'application/json; charset=utf-8' },
  );
}
