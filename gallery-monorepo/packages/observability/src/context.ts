/**
 * 异步链路上下文：用 AsyncLocalStorage 保存当前 trace / span，
 * 供日志 mixin 与业务埋点读取；同时兼容 OpenTelemetry 的活动 span。
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { TraceFlags, trace, type SpanContext } from '@opentelemetry/api';

import type { TraceContext, TraceLogFields } from './types.js';

const storage = new AsyncLocalStorage<TraceContext>();

/** 合法的 trace_id 为 32 位十六进制且不能全为 0。 */
function isValidTraceId(traceId: string): boolean {
  return /^[0-9a-f]{32}$/.test(traceId) && traceId !== '0'.repeat(32);
}

/** 把 OpenTelemetry SpanContext 转成对外暴露的精简结构；非法上下文返回 undefined。 */
export function toTraceContext(spanContext: SpanContext): TraceContext | undefined {
  if (!isValidTraceId(spanContext.traceId)) {
    return undefined;
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    sampled: (spanContext.traceFlags & TraceFlags.SAMPLED) !== 0,
  };
}

/** 在指定的 trace 上下文中执行回调。 */
export function runWithTraceContext<T>(traceContext: TraceContext | undefined, fn: () => T): T {
  return traceContext ? storage.run(traceContext, fn) : fn();
}

/**
 * 读取当前链路信息：优先使用显式写入的 AsyncLocalStorage，
 * 其次读取 OpenTelemetry 活动 span（兼容其它 SDK / 自动埋点创建的 span）。
 */
export function getTraceContext(): TraceContext | undefined {
  const stored = storage.getStore();
  if (stored) {
    return stored;
  }

  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext ? toTraceContext(spanContext) : undefined;
}

/** 日志字段：统一用 `trace_id` / `span_id`，与 Grafana / Loki 派生字段约定一致。 */
export function traceLogFields(): TraceLogFields {
  const traceContext = getTraceContext();
  return traceContext
    ? { trace_id: traceContext.traceId, span_id: traceContext.spanId }
    : {};
}
