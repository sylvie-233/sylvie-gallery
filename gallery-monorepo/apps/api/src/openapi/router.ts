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
 * 把「返回值符合项目统一响应结构」的处理器绑定到路由。
 *
 * 处理器内部可通过 `c.req.valid('query' | 'json' | 'param')` 获取已校验数据，
 * 无需再次手动解析请求。控制器统一返回原生 `Response`，因此这里做一次类型放宽。
 */
export function routeHandler<R extends RouteConfig>(
  _route: R,
  handler: (c: Parameters<RouteHandler<R, AppEnv>>[0]) => Response | Promise<Response>,
): RouteHandler<R, AppEnv> {
  return handler as unknown as RouteHandler<R, AppEnv>;
}
