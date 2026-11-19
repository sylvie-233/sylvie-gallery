/**
 * HTTP 响应辅助：统一 `{ code, message, data }` 响应结构，
 * 并提供由全局错误中间件消费的业务异常类型。
 */
import type { Context, TypedResponse } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { JSONParsed } from 'hono/utils/types';


/** 业务异常：由全局错误中间件转换为统一响应。 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** 成功响应的 JSON 结构；`code` 恒为 200，HTTP 状态码由 `success` 的 `status` 决定。 */
export type ApiOk<T> = {
  code: 200;
  message: string;
  data: T;
};

/**
 * 统一成功响应。
 *
 * 使用 `c.json` 而不是 `c.body(JSON.stringify(...))`，让 Hono 推导出
 * `TypedResponse<ApiOk<T>, S, 'json'>`；控制器返回类型因此能够保留
 * data 的具体类型，并可与路由的 `RouteHandler<typeof route>` 对齐。
 */
export type SuccessResponse<T, S extends ContentfulStatusCode = 200> = Response &
  TypedResponse<JSONParsed<ApiOk<T>>, S, 'json'>;

export function success<T, S extends ContentfulStatusCode = 200>(
  c: Context,
  data: T,
  message = '操作成功',
  status: S = 200 as S,
): SuccessResponse<T, S> {
  const body: ApiOk<T> = { code: 200, message, data };
  return c.json(body, status);
}

/** 统一失败响应（供中间件直接使用）。 */
export function failure(c: Context, status: number, message: string): Response {
  return c.body(
    JSON.stringify({ code: status, message, data: null }),
    status as ContentfulStatusCode,
    { 'Content-Type': 'application/json; charset=utf-8' },
  );
}
