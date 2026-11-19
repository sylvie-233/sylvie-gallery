/**
 * 指标句柄：在 SDK 启动后才绑定真实的 OpenTelemetry 仪表，
 * 因此允许业务模块在启动前创建指标（如模块级常量），避免时序依赖。
 */
import type { Meter } from '@opentelemetry/api';

import type {
  MetricAttributes,
  MetricCounter,
  MetricHistogram,
  MetricOptions,
} from './types.js';

type MeterProvider = () => Meter | undefined;

/** 延迟绑定计数器：SDK 未启动时所有写入为 no-op。 */
export class LazyCounter implements MetricCounter {
  private instrument: ReturnType<Meter['createCounter']> | undefined;

  constructor(
    private readonly getMeter: MeterProvider,
    private readonly name: string,
    private readonly options?: MetricOptions,
  ) {}

  add(value = 1, attributes?: MetricAttributes): void {
    const meter = this.getMeter();
    if (!meter) {
      return;
    }

    this.instrument ??= meter.createCounter(this.name, {
      description: this.options?.description,
      unit: this.options?.unit,
    });
    this.instrument.add(value, attributes);
  }
}

/** 延迟绑定直方图：SDK 未启动时所有写入为 no-op。 */
export class LazyHistogram implements MetricHistogram {
  private instrument: ReturnType<Meter['createHistogram']> | undefined;

  constructor(
    private readonly getMeter: MeterProvider,
    private readonly name: string,
    private readonly options?: MetricOptions,
  ) {}

  record(value: number, attributes?: MetricAttributes): void {
    const meter = this.getMeter();
    if (!meter) {
      return;
    }

    this.instrument ??= meter.createHistogram(this.name, {
      description: this.options?.description,
      unit: this.options?.unit,
    });
    this.instrument.record(value, attributes);
  }
}

/**
 * 内置指标集合。名称按 OpenTelemetry → Prometheus 的默认转换规则设计：
 * 计数器补 `_total`，直方图按 `unit: 's'` 补 `_seconds`。
 */
export interface BuiltinMetrics {
  httpRequests: MetricCounter;
  httpDuration: MetricHistogram;
  toolCalls: MetricCounter;
  toolErrors: MetricCounter;
  toolDuration: MetricHistogram;
}

/** 创建内置指标句柄。 */
export function createBuiltinMetrics(getMeter: MeterProvider): BuiltinMetrics {
  return {
    httpRequests: new LazyCounter(getMeter, 'sylvie.http.server.requests', {
      description: 'HTTP 请求总数',
    }),
    httpDuration: new LazyHistogram(getMeter, 'sylvie.http.server.request.duration', {
      description: 'HTTP 请求耗时',
      unit: 's',
    }),
    toolCalls: new LazyCounter(getMeter, 'sylvie.mcp.tool.calls', {
      description: 'MCP 工具调用次数',
    }),
    toolErrors: new LazyCounter(getMeter, 'sylvie.mcp.tool.errors', {
      description: 'MCP 工具调用失败次数',
    }),
    toolDuration: new LazyHistogram(getMeter, 'sylvie.mcp.tool.duration', {
      description: 'MCP 工具调用耗时',
      unit: 's',
    }),
  };
}
