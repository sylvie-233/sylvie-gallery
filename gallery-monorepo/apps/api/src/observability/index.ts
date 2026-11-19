/**
 * 可观测性实例装配：把 env 映射为 `@sylvie/observability` 配置。
 * 包内不读取环境变量，所有配置在此显式注入，便于测试与替换。
 */
import { createObservability } from '@sylvie/observability';

import { env } from '../config/env.js';

/** 解析 `key=value,key2=value2` 形式的 OTLP 请求头。 */
function parseHeaders(value: string): Record<string, string> | undefined {
  const entries = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separator = item.indexOf('=');
      if (separator <= 0) {
        return null;
      }
      return [item.slice(0, separator).trim(), item.slice(separator + 1).trim()] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** 额外禁用的自动埋点：逗号分隔。 */
function parseDisabledInstrumentations(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 应用级可观测性门面。 */
export const observability = createObservability({
  enabled: env.OBSERVABILITY_ENABLED === 'true',
  serviceName: env.OTEL_SERVICE_NAME,
  serviceVersion: '1.0.0',
  environment: env.NODE_ENV,
  endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
  headers: parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
  traces: {
    enabled: env.OTEL_TRACES_ENABLED === 'true',
    sampleRatio: env.OTEL_TRACE_SAMPLE_RATIO,
  },
  metrics: {
    enabled: env.OTEL_METRICS_ENABLED === 'true',
    exportIntervalMillis: env.OTEL_METRIC_EXPORT_INTERVAL,
  },
  instrumentations: {
    disabled: parseDisabledInstrumentations(env.OTEL_DISABLED_INSTRUMENTATIONS),
  },
});

/** 启动遥测；须在加载 mysql2 / http / ioredis 等被埋点模块之前调用。 */
export function startObservability(): Promise<void> {
  return observability.start();
}

/** 关闭遥测并尽量 flush 数据。 */
export function stopObservability(): Promise<void> {
  return observability.shutdown();
}
