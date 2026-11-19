/**
 * 日志公共类型：级别、结构化字段、创建配置与统一 Logger 接口。
 * 业务层只依赖 `Logger`，不直接依赖 pino。
 */
import type { Logger as PinoLogger, LoggerOptions as PinoLoggerOptions } from 'pino';

/** 可用的日志级别。 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

/** 结构化日志字段。 */
export type LogFields = Record<string, unknown>;

/** 创建日志实例的配置。 */
export interface LoggerOptions {
  /** 服务名，写入每条日志的 `service` 字段（必填，便于多服务聚合检索）。 */
  service: string;
  /** 最低输出级别，默认 `info`。 */
  level?: LogLevel;
  /** 是否使用 pino-pretty 彩色输出；默认非 production 环境开启。 */
  pretty?: boolean;
  /** 每条日志都携带的固定字段（如环境、版本号）。 */
  base?: LogFields;
  /** 追加的脱敏字段路径（pino redact 语法），会与内置规则合并。 */
  redact?: string[];
  /** 逃生舱：直接覆盖 pino 原生配置，用于特殊场景。 */
  pinoOptions?: PinoLoggerOptions;
}

/**
 * 统一日志接口：对 pino 的轻量封装。
 * 业务层只依赖该接口，后续可整体替换底层实现。
 */
export interface Logger {
  /** 底层 pino 实例，特殊场景可直接使用。 */
  readonly raw: PinoLogger;

  trace(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;

  /** 支持 `log.warn('消息', error)` 或 `log.warn('消息', { 字段 })`。 */
  warn(message: string, errorOrFields?: unknown, fields?: LogFields): void;
  error(message: string, errorOrFields?: unknown, fields?: LogFields): void;
  fatal(message: string, errorOrFields?: unknown, fields?: LogFields): void;

  /** 派生带固定字段的子日志。 */
  child(bindings: LogFields): Logger;

  /** `child({ module })` 的语法糖，用于按模块打标。 */
  scope(module: string, bindings?: LogFields): Logger;

  /** 当前级别是否启用。 */
  isLevelEnabled(level: Exclude<LogLevel, 'silent'>): boolean;

  /** 等待异步日志（如 transport）落盘完成。 */
  flush(): Promise<void>;
}
