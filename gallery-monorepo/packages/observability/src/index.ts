/**
 * `@sylvie/observability` 包入口：导出配置 / 门面接口与 `createObservability` 工厂。
 * 业务只通过门面使用链路、指标与日志关联能力，不直接依赖 OpenTelemetry。
 */
export * from './types.js';
export { createObservability } from './observability.js';
