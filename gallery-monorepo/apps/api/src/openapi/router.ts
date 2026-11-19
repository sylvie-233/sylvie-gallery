/**
 * OpenAPI 路由工具：创建带统一校验错误响应的路由实例，
 * 并提供放宽控制器返回类型的处理器绑定辅助函数。
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';

import type { AppEnv } from '../types/context.js';
import { formatZodError } from '../utils/validate.js';

/** 创建带统一校验错误响应的 OpenAPI 路由实例。 */
export function createApiRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.body(
          JSON.stringify({ code: 400, message: formatZodError(result.error), data: null }),
          400,
          { 'Content-Type': 'application/json; charset=utf-8' },
        );
      }
    },
  });
}

/**
 * 把控制器绑定到路由，并保留 `RouteHandler` 的返回类型约束。
 *
 * 控制器内部通过 `success()` 返回 `TypedResponse`，其 data 类型必须与
 * 路由 `responses` 中的 schema 对齐；不匹配时在这里直接编译报错。
 * 少数流式/纯文本响应（ZIP 下载、支付宝通知、CSV）使用 `rawRouteHandler`。
 */
export function routeHandler<R extends RouteConfig>(
  _route: R,
  handler: RouteHandler<R, AppEnv>,
): RouteHandler<R, AppEnv> {
  return handler;
}
