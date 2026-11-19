/**
 * 可观测性门面：按配置装配 OpenTelemetry SDK、Hono 中间件与业务埋点能力。
 * SDK 通过动态 import 延迟加载，关闭时完全不引入运行时开销。
 */
import { metrics, type Meter } from '@opentelemetry/api';
import type { NodeSDK } from '@opentelemetry/sdk-node';
import type { MiddlewareHandler } from 'hono';

import { getTraceContext, traceLogFields } from './context.js';
import {
  createHttpMiddleware,
  isIgnoredPath,
  recordHttpRequest as writeHttpRequestMetric,
} from './middleware.js';
import { LazyCounter, LazyHistogram, createBuiltinMetrics } from './metrics.js';
import { withSpan } from './span.js';
import type {
  HttpRequestRecord,
  MetricAttributes,
  MetricCounter,
  MetricHistogram,
  MetricOptions,
  Observability,
  ObservabilityOptions,
  SpanHandle,
  SpanOptions,
} from './types.js';

/** 默认关闭的自动埋点：噪声大、与 API 无关或会重复采日志的插件。 */
const DEFAULT_DISABLED_INSTRUMENTATIONS = [
  'fs',
  'dns',
  'net',
  'pino',
  'winston',
  'bunyan',
  'express',
  'koa',
  'hapi',
  'connect',
  'restify',
  'router',
  'graphql',
  'mongoose',
  'mongodb',
  'pg',
  'tedious',
  'oracledb',
  'cucumber',
  'socket.io',
  'openai',
];

/** 默认不建 span 的路径：健康检查、接口文档与 OpenAPI JSON。 */
const DEFAULT_IGNORE_PATHS = ['/health', '/api/docs', '/api/openapi.json'];

/** HTTP instrumentation 名称，用于关闭重复的服务端 span。 */
const HTTP_INSTRUMENTATION = '@opentelemetry/instrumentation-http';

/** MySQL2 instrumentation 名称，用于配置 SQL 文本脱敏。 */
const MYSQL2_INSTRUMENTATION = '@opentelemetry/instrumentation-mysql2';

const METER_NAME = 'sylvie-observability';

interface RuntimeState {
  sdk?: NodeSDK;
  meter?: Meter;
  starting?: Promise<void>;
}

/** 把端点归一化为具体 signal 的 OTLP HTTP 地址。 */
function signalEndpoint(endpoint: string | undefined, signal: 'traces' | 'metrics'): string | undefined {
  const trimmed = endpoint?.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return undefined;
  }
  return trimmed.includes(`/v1/${signal}`) ? trimmed : `${trimmed}/v1/${signal}`;
}

/** 归一化采样率到 [0, 1]。 */
function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 1;
  }
  return Math.min(1, Math.max(0, ratio));
}

/** 基于配置创建可观测性门面。 */
export function createObservability(options: ObservabilityOptions): Observability {
  const enabled = options.enabled;
  const tracesEnabled = enabled && options.traces?.enabled !== false;
  const metricsEnabled = enabled && options.metrics?.enabled !== false;
  const ignorePaths = options.http?.ignorePaths ?? DEFAULT_IGNORE_PATHS;
  const exposeTraceId = options.http?.exposeTraceId ?? true;

  const state: RuntimeState = {};
  const builtinMetrics = createBuiltinMetrics(() => state.meter);
  let middleware: MiddlewareHandler | undefined;

  /** resource：服务标识 + 调用方追加属性。 */
  async function buildResource() {
    const { defaultResource, resourceFromAttributes } = await import(
      '@opentelemetry/resources'
    );

    return defaultResource().merge(
      resourceFromAttributes({
        'service.name': options.serviceName,
        ...(options.serviceVersion ? { 'service.version': options.serviceVersion } : {}),
        ...(options.environment
          ? { 'deployment.environment.name': options.environment }
          : {}),
        ...options.resourceAttributes,
      }),
    );
  }

  /** 自动埋点集合：默认推荐项 + 调用方禁用项；HTTP 入站 span 由 Hono 中间件负责。 */
  async function buildInstrumentations() {
    if (options.instrumentations === false) {
      return [];
    }

    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    );

    const disabled = new Set(DEFAULT_DISABLED_INSTRUMENTATIONS);
    const extraDisabled =
      typeof options.instrumentations === 'object'
        ? (options.instrumentations.disabled ?? [])
        : [];
    for (const name of extraDisabled) {
      disabled.add(name.replace(/^@opentelemetry\/instrumentation-/, ''));
    }

    const configs: Record<string, Record<string, unknown>> = {
      [HTTP_INSTRUMENTATION]: {
        enabled: true,
        // 只为忽略路径关闭入站埋点。其余请求交给 instrumentation-http 创建服务端 span，
        // Hono 中间件会复用该 span；若这里一律忽略，instrumentation 会启用
        // tracing suppression，导致中间件自建 span 退化为 Noop。
        ignoreIncomingRequestHook: (request: { url?: string }) => {
          const url = request.url ?? '/';
          const queryIndex = url.indexOf('?');
          return isIgnoredPath(
            queryIndex >= 0 ? url.slice(0, queryIndex) : url,
            ignorePaths,
          );
        },
      },
      [MYSQL2_INSTRUMENTATION]: {
        // mysql2 默认会把参数格式化进 db.query.text（可能包含邮箱、令牌等业务值），
        // 开启脱敏后只保留 SQL 结构与表名，参数统一替换为 ?。
        maskStatement: true,
      },
    };
    for (const name of disabled) {
      configs[`@opentelemetry/instrumentation-${name}`] = { enabled: false };
    }

    return getNodeAutoInstrumentations(
      configs as Parameters<typeof getNodeAutoInstrumentations>[0],
    );
  }

  async function startSdk(): Promise<void> {
    const [
      { NodeSDK },
      { OTLPTraceExporter },
      { OTLPMetricExporter },
      { PeriodicExportingMetricReader },
    ] = await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/exporter-metrics-otlp-http'),
      import('@opentelemetry/sdk-metrics'),
    ]);

    // NodeSDK 从环境变量读取采样器；未显式配置时按 sampleRatio 生成。
    if (!tracesEnabled) {
      process.env.OTEL_TRACES_SAMPLER ??= 'always_off';
    } else if (
      options.traces?.sampleRatio !== undefined &&
      process.env.OTEL_TRACES_SAMPLER === undefined
    ) {
      process.env.OTEL_TRACES_SAMPLER = 'parentbased_traceidratio';
      process.env.OTEL_TRACES_SAMPLER_ARG = String(clampRatio(options.traces.sampleRatio));
    }

    const resource = await buildResource();
    const instrumentations = await buildInstrumentations();
    const headers = options.headers && Object.keys(options.headers).length > 0
      ? options.headers
      : undefined;

    const traceExporter = tracesEnabled
      ? new OTLPTraceExporter({
          ...(signalEndpoint(options.endpoint, 'traces')
            ? { url: signalEndpoint(options.endpoint, 'traces') }
            : {}),
          ...(headers ? { headers } : {}),
        })
      : undefined;

    const metricReader = metricsEnabled
      ? new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            ...(signalEndpoint(options.endpoint, 'metrics')
              ? { url: signalEndpoint(options.endpoint, 'metrics') }
              : {}),
            ...(headers ? { headers } : {}),
          }),
          exportIntervalMillis: options.metrics?.exportIntervalMillis ?? 15_000,
        })
      : undefined;

    const sdk = new NodeSDK({
      resource,
      serviceName: options.serviceName,
      instrumentations,
      // 日志由 pino + Alloy 采集，禁用 OTel 日志通道，避免重复上报。
      logRecordProcessors: [],
      ...(traceExporter ? { traceExporter } : { spanProcessors: [] }),
      ...(metricReader ? { metricReaders: [metricReader] } : { metricReaders: [] }),
    });

    sdk.start();
    state.sdk = sdk;
    state.meter = metricsEnabled ? metrics.getMeter(METER_NAME) : undefined;
  }

  /** 工具指标属性：服务名 + 工具名 + 结果。 */
  function toolAttributes(toolName: string, outcome: 'success' | 'error'): MetricAttributes {
    return {
      'mcp.tool.name': toolName,
      'mcp.tool.outcome': outcome,
      'service.name': options.serviceName,
      ...(options.environment
        ? { 'deployment.environment.name': options.environment }
        : {}),
    };
  }

  return {
    enabled,

    middleware(): MiddlewareHandler {
      middleware ??= createHttpMiddleware({
        enabled,
        serviceName: options.serviceName,
        environment: options.environment,
        ignorePaths,
        exposeTraceId,
        metrics: builtinMetrics,
      });
      return middleware;
    },

    async start(): Promise<void> {
      if (!enabled || state.starting) {
        return state.starting ?? Promise.resolve();
      }

      state.starting = startSdk().catch((error: unknown) => {
        // 启动失败只影响可观测性本身，调用方记录后继续提供业务服务。
        state.starting = undefined;
        throw error;
      });

      return state.starting;
    },

    async shutdown(): Promise<void> {
      const sdk = state.sdk;
      state.sdk = undefined;
      state.meter = undefined;
      if (!sdk) {
        return;
      }
      await sdk.shutdown();
    },

    getTraceContext(): ReturnType<typeof getTraceContext> {
      return enabled ? getTraceContext() : undefined;
    },

    traceLogFields(): ReturnType<typeof traceLogFields> {
      return enabled ? traceLogFields() : {};
    },

    withSpan<T>(
      name: string,
      fn: (span: SpanHandle) => T | Promise<T>,
      spanOptions?: SpanOptions,
    ): Promise<T> {
      if (!enabled) {
        return Promise.resolve(fn(NOOP_SPAN));
      }
      return withSpan(name, fn, spanOptions);
    },

    async wrapToolHandler<T>(toolName: string, handler: () => T | Promise<T>): Promise<T> {
      if (!enabled) {
        return handler();
      }

      const startedAt = performance.now();
      let outcome: 'success' | 'error' = 'success';

      try {
        return await withSpan(
          `MCP ${toolName}`,
          async (span) => {
            span.setAttribute('mcp.tool.name', toolName);
            span.setAttribute('service.name', options.serviceName);
            const result = await handler();
            span.setAttribute('mcp.tool.outcome', 'success');
            return result;
          },
          { kind: 'internal' },
        );
      } catch (error) {
        outcome = 'error';
        throw error;
      } finally {
        const attributes = toolAttributes(toolName, outcome);
        builtinMetrics.toolCalls.add(1, attributes);
        if (outcome === 'error') {
          builtinMetrics.toolErrors.add(1, attributes);
        }
        builtinMetrics.toolDuration.record((performance.now() - startedAt) / 1000, attributes);
      }
    },

    counter(name: string, metricOptions?: MetricOptions): MetricCounter {
      return new LazyCounter(() => state.meter, name, metricOptions);
    },

    histogram(name: string, metricOptions?: MetricOptions): MetricHistogram {
      return new LazyHistogram(() => state.meter, name, metricOptions);
    },

    recordHttpRequest(record: HttpRequestRecord): void {
      if (!enabled || isIgnoredPath(record.route, ignorePaths)) {
        return;
      }
      writeHttpRequestMetric(
        builtinMetrics,
        options.serviceName,
        options.environment,
        record,
      );
    },
  };
}

/** 关闭状态下 withSpan 使用的空 span。 */
const NOOP_SPAN: SpanHandle = {
  setAttribute: () => undefined,
  setAttributes: () => undefined,
  addEvent: () => undefined,
  recordException: () => undefined,
  setError: () => undefined,
  setOk: () => undefined,
};
