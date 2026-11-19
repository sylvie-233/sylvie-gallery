/**
 * 可观测性层的公共类型：配置项、门面接口与对外暴露的最小能力。
 * 业务只依赖这些类型，不直接依赖 OpenTelemetry 的具体实现。
 */
import type { MiddlewareHandler } from 'hono';

/** 指标属性值（对应 OpenTelemetry AttributeValue 的基础类型）。 */
export type AttributeValue = string | number | boolean;

/** 指标属性集合。 */
export type MetricAttributes = Record<string, AttributeValue>;

/** 与日志层配合的 trace 字段，字段名与 Grafana / Loki 的约定保持一致。 */
export type TraceLogFields = Record<string, unknown>;

/** 当前异步上下文的链路信息。 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

/** span 类型。 */
export type SpanKindName = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

/** 手动埋点时可操作的 span 句柄，避免业务直接接触 OpenTelemetry API。 */
export interface SpanHandle {
  setAttribute(key: string, value: AttributeValue): void;
  setAttributes(attributes: MetricAttributes): void;
  addEvent(name: string, attributes?: MetricAttributes): void;
  recordException(error: unknown): void;
  /** 标记为错误并记录说明。 */
  setError(message?: string): void;
  /** 标记为成功（默认状态即为成功，通常在需要显式覆盖时使用）。 */
  setOk(): void;
}

/** `withSpan` 的选项。 */
export interface SpanOptions {
  kind?: SpanKindName;
  attributes?: MetricAttributes;
}

/** 计数器句柄。 */
export interface MetricCounter {
  add(value?: number, attributes?: MetricAttributes): void;
}

/** 直方图句柄。 */
export interface MetricHistogram {
  record(value: number, attributes?: MetricAttributes): void;
}

/** 自定义指标配置。 */
export interface MetricOptions {
  description?: string;
  /** 单位，遵循 OpenTelemetry 约定，如 `s`、`ms`、`By`。 */
  unit?: string;
}

/** Hono 中间件行为配置。 */
export interface HonoObservabilityOptions {
  /** 不建 span、不记指标的路径（精确匹配或以 `/` 前缀匹配），默认排除健康检查与文档页。 */
  ignorePaths?: string[];
  /** 是否在响应头写入 `x-trace-id`，默认 true，便于前后端联调。 */
  exposeTraceId?: boolean;
}

/** 一次 HTTP 请求的指标记录。 */
export interface HttpRequestRecord {
  method: string;
  route: string;
  status: number;
  durationMs: number;
}

/** 创建可观测性门面的配置。 */
export interface ObservabilityOptions {
  /** 总开关；false 时所有能力退化为 no-op，且不加载 OpenTelemetry SDK。 */
  enabled: boolean;
  /** 服务名，写入 resource 与指标属性，便于多服务聚合。 */
  serviceName: string;
  serviceVersion?: string;
  /** 运行环境，如 development / production。 */
  environment?: string;
  /**
   * OTLP HTTP 端点，如 `http://127.0.0.1:4318`。
   * 留空时使用 OpenTelemetry 标准环境变量 / 默认端点。
   */
  endpoint?: string;
  /** OTLP 请求头，用于 Grafana Cloud 等需要鉴权的后端。 */
  headers?: Record<string, string>;
  traces?: {
    /** 是否导出链路，默认 true。 */
    enabled?: boolean;
    /** 根 span 采样率 0~1，默认 1；设置了 `OTEL_TRACES_SAMPLER` 时以环境变量为准。 */
    sampleRatio?: number;
  };
  metrics?: {
    /** 是否导出指标，默认 true。 */
    enabled?: boolean;
    /** 指标导出间隔（毫秒），默认 15000。 */
    exportIntervalMillis?: number;
  };
  /**
   * 自动埋点开关：false 关闭全部自动 instrumentation；
   * 对象形式可在推荐集合基础上按名称禁用（如 `fs`、`http`、`pino`）。
   */
  instrumentations?: boolean | { disabled?: string[] };
  /** 追加到 resource 的属性。 */
  resourceAttributes?: MetricAttributes;
  /** Hono 中间件行为。 */
  http?: HonoObservabilityOptions;
}

/** 可观测性门面：应用只依赖该接口，便于整体替换或关闭。 */
export interface Observability {
  readonly enabled: boolean;
  /** Hono 全局中间件：生成服务端 span、记录 HTTP 指标并注入 trace 上下文。 */
  middleware(): MiddlewareHandler;
  /** 启动 SDK。必须在加载被埋点模块（mysql2 / http / ioredis 等）之前调用。 */
  start(): Promise<void>;
  /** 关闭 SDK 并尽量 flush 遥测数据。 */
  shutdown(): Promise<void>;
  /** 当前异步上下文 / 活动 span 的链路信息。 */
  getTraceContext(): TraceContext | undefined;
  /** pino mixin：返回 `{ trace_id, span_id }`，无链路时为空对象。 */
  traceLogFields(): TraceLogFields;
  /** 在 span 中执行回调，自动记录异常与错误状态。 */
  withSpan<T>(
    name: string,
    fn: (span: SpanHandle) => T | Promise<T>,
    options?: SpanOptions,
  ): Promise<T>;
  /** MCP 工具调用包装：span + 调用数 / 失败数 / 耗时指标。 */
  wrapToolHandler<T>(toolName: string, handler: () => T | Promise<T>): Promise<T>;
  /** 创建自定义计数器（延迟绑定，可在 SDK 启动前调用）。 */
  counter(name: string, options?: MetricOptions): MetricCounter;
  /** 创建自定义直方图（延迟绑定，可在 SDK 启动前调用）。 */
  histogram(name: string, options?: MetricOptions): MetricHistogram;
  /** 手动记录一次 HTTP 请求，供 Hono 之外的自定义接入复用。 */
  recordHttpRequest(record: HttpRequestRecord): void;
}
