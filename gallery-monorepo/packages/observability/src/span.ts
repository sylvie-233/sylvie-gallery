/**
 * span 封装：对外提供精简的 SpanHandle，业务无需直接依赖 OpenTelemetry API；
 * 同时把当前 span 写入 AsyncLocalStorage，保证日志携带 trace_id / span_id。
 */
import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Exception,
  type Span,
} from '@opentelemetry/api';

import { runWithTraceContext, toTraceContext } from './context.js';
import type { SpanHandle, SpanKindName, SpanOptions } from './types.js';

const SPAN_KINDS: Record<SpanKindName, SpanKind> = {
  internal: SpanKind.INTERNAL,
  server: SpanKind.SERVER,
  client: SpanKind.CLIENT,
  producer: SpanKind.PRODUCER,
  consumer: SpanKind.CONSUMER,
};

/** 把未知异常转成 OpenTelemetry 可记录的 Exception。 */
function toException(error: unknown): Exception {
  return error instanceof Error ? error : String(error);
}

/** 从异常中提取可读信息，用于 span 状态说明。 */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}

/** SpanHandle 实现：仅暴露最常用的埋点能力。 */
class SpanHandleImpl implements SpanHandle {
  constructor(private readonly span: Span) {}

  setAttribute(key: string, value: string | number | boolean): void {
    this.span.setAttribute(key, value);
  }

  setAttributes(attributes: Record<string, string | number | boolean>): void {
    this.span.setAttributes(attributes);
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
    this.span.addEvent(name, attributes);
  }

  recordException(error: unknown): void {
    this.span.recordException(toException(error));
  }

  setError(message?: string): void {
    this.span.setStatus({ code: SpanStatusCode.ERROR, message });
  }

  setOk(): void {
    this.span.setStatus({ code: SpanStatusCode.OK });
  }
}

/** 获取 tracer；SDK 未启动时返回 no-op tracer，回调仍会正常执行。 */
function getTracer() {
  return trace.getTracer('sylvie-observability');
}

/**
 * 在新建 span 中执行回调：
 * - span 自动成为当前活动 span；
 * - 抛出的异常会记录到 span 并标记为 ERROR 后继续向上抛；
 * - 回调始终在对应的 trace 上下文中执行，内部日志可关联 trace_id。
 */
export async function withSpan<T>(
  name: string,
  fn: (span: SpanHandle) => T | Promise<T>,
  options?: SpanOptions,
): Promise<T> {
  const parentContext = context.active();
  const span = getTracer().startSpan(name, {
    kind: SPAN_KINDS[options?.kind ?? 'internal'],
    attributes: options?.attributes,
  }, parentContext);

  const traceContext = toTraceContext(span.spanContext());

  return runWithTraceContext(traceContext, () =>
    context.with(trace.setSpan(parentContext, span), async () => {
      try {
        return await fn(new SpanHandleImpl(span));
      } catch (error) {
        span.recordException(toException(error));
        span.setStatus({ code: SpanStatusCode.ERROR, message: toErrorMessage(error) });
        throw error;
      } finally {
        span.end();
      }
    }),
  );
}
