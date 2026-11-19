/**
 * Hono 可观测性中间件：服务端 span + HTTP 指标 + 链路上下文注入。
 * 不依赖 Hono 的 OpenTelemetry 插件，避免与自动埋点重复建 span。
 */
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from '@opentelemetry/api';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

import { runWithTraceContext, toTraceContext } from './context.js';
import type { BuiltinMetrics } from './metrics.js';
import type { HttpRequestRecord } from './types.js';

interface HttpMiddlewareConfig {
  enabled: boolean;
  serviceName: string;
  environment?: string;
  ignorePaths: string[];
  exposeTraceId: boolean;
  metrics: BuiltinMetrics;
}

/** 路径是否命中忽略规则：精确匹配，或以 `规则/` 为前缀。 */
export function isIgnoredPath(path: string, patterns: string[]): boolean {
  return patterns.some(
    (pattern) => path === pattern || (pattern !== '' && path.startsWith(`${pattern}/`)),
  );
}

/** 从异常中推断响应状态，用于异常路径的指标记录。 */
function inferStatus(error: unknown): number {
  if (error !== null && typeof error === 'object') {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') {
      return status;
    }
    if ((error as { name?: unknown }).name === 'ZodError') {
      return 400;
    }
  }
  return 500;
}

/** 记录一次 HTTP 请求指标；中间件与自定义框架接入共用。 */
export function recordHttpRequest(
  metrics: BuiltinMetrics,
  serviceName: string,
  environment: string | undefined,
  record: HttpRequestRecord,
): void {
  const attributes = {
    'http.request.method': record.method,
    'http.route': record.route,
    'http.response.status_code': record.status,
    'service.name': serviceName,
    ...(environment ? { 'deployment.environment.name': environment } : {}),
  };

  metrics.httpRequests.add(1, attributes);
  metrics.httpDuration.record(record.durationMs / 1000, attributes);
}

/** 创建 Hono 全局中间件。 */
export function createHttpMiddleware(config: HttpMiddlewareConfig): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    if (!config.enabled || isIgnoredPath(c.req.path, config.ignorePaths)) {
      await next();
      return;
    }

    const method = c.req.method;
    const path = c.req.path;
    const tracer = trace.getTracer('sylvie-observability');

    // 自动埋点（instrumentation-http）通常会先创建入站 span：直接复用它并补充路由信息，
    // 避免产生一层重复的服务端 span。关闭自动埋点时则自行创建。
    const activeSpan = trace.getActiveSpan();
    const activeContext = activeSpan ? toTraceContext(activeSpan.spanContext()) : undefined;
    let span: Span;
    let ownsSpan = false;
    let parentContext = context.active();

    if (activeSpan && activeContext) {
      span = activeSpan;
      span.setAttributes({
        'http.request.method': method,
        'url.path': path,
        'service.name': config.serviceName,
        ...(config.environment
          ? { 'deployment.environment.name': config.environment }
          : {}),
      });
    } else {
      parentContext = propagation.extract(context.active(), c.req.raw.headers);
      span = tracer.startSpan(
        `${method} ${path}`,
        {
          kind: SpanKind.SERVER,
          attributes: {
            'http.request.method': method,
            'url.path': path,
            'service.name': config.serviceName,
            ...(config.environment
              ? { 'deployment.environment.name': config.environment }
              : {}),
          },
        },
        parentContext,
      );
      ownsSpan = true;
    }

    const traceContext = toTraceContext(span.spanContext());
    if (config.exposeTraceId && traceContext) {
      c.header('x-trace-id', traceContext.traceId);
    }

    const startedAt = performance.now();
    let route = path;
    let status = 500;
    let failed = false;

    try {
      await runWithTraceContext(traceContext, () =>
        context.with(trace.setSpan(parentContext, span), async () => {
          try {
            await next();
            status = c.res.status;
            route = c.req.routePath || path;
          } catch (error) {
            failed = true;
            status = inferStatus(error);
            span.recordException(error instanceof Error ? error : String(error));
            throw error;
          }
        }),
      );
    } catch (error) {
      if (status >= 500) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    } finally {
      const durationMs = performance.now() - startedAt;

      span.setAttribute('http.route', route);
      span.setAttribute('http.response.status_code', status);
      span.updateName(`${method} ${route}`);
      // 异常路径的状态与 message 已在 catch 中写入，避免覆盖丢说明。
      if (status >= 500 && !failed) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      // 复用的入站 span 由 instrumentation-http 负责结束，这里只结束自建 span。
      if (ownsSpan) {
        span.end();
      }

      recordHttpRequest(config.metrics, config.serviceName, config.environment, {
        method,
        route,
        status,
        durationMs,
      });
    }
  });
}
