/**
 * 基于 pino 的日志实现：统一输出结构化日志，内置敏感字段脱敏，
 * 并提供 `child` / `scope` 派生上下文与 `flush` 落盘等待。
 */
import pino from 'pino';

import type { LogFields, Logger, LoggerOptions } from './types.js';

/**
 * 默认脱敏字段：认证信息与常见凭据，覆盖根字段、一级子字段及
 * 常见 HTTP 头位置；命中后值统一替换为 `[REDACTED]`。
 */
const DEFAULT_REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'req.headers.authorization',
  'headers.authorization',
  'res.headers.set-cookie',
];

/**
 * 把「Error 或字段对象」统一整理成 pino 的结构化字段：
 * Error 放入 `err`（由 pino 序列化为 name/message/stack），普通对象合并为字段，
 * 其它原始值放入 `detail`。
 */
function normalizeFields(errorOrFields: unknown, extra?: LogFields): LogFields {
  const fields: LogFields = {};

  if (errorOrFields instanceof Error) {
    fields.err = errorOrFields;
  } else if (errorOrFields !== null && typeof errorOrFields === 'object') {
    Object.assign(fields, errorOrFields);
  } else if (errorOrFields !== undefined) {
    fields.detail = errorOrFields;
  }

  if (extra) {
    Object.assign(fields, extra);
  }

  return fields;
}

/**
 * 将 pino 实例包装为统一 Logger 接口。
 *
 * `trace` / `debug` / `info` 只接受字段对象；`warn` / `error` / `fatal`
 * 额外兼容直接传入 Error。`scope` 等价于携带 `module` 的 `child`。
 */
function wrap(raw: pino.Logger): Logger {
  const writeWithFields = (
    level: 'warn' | 'error' | 'fatal',
    message: string,
    errorOrFields: unknown,
    fields?: LogFields,
  ): void => {
    raw[level](normalizeFields(errorOrFields, fields), message);
  };

  return {
    raw,
    trace: (message, fields) => raw.trace(fields ?? {}, message),
    debug: (message, fields) => raw.debug(fields ?? {}, message),
    info: (message, fields) => raw.info(fields ?? {}, message),
    warn: (message, errorOrFields, fields) =>
      writeWithFields('warn', message, errorOrFields, fields),
    error: (message, errorOrFields, fields) =>
      writeWithFields('error', message, errorOrFields, fields),
    fatal: (message, errorOrFields, fields) =>
      writeWithFields('fatal', message, errorOrFields, fields),
    child: (bindings) => wrap(raw.child(bindings)),
    scope: (module, bindings = {}) => wrap(raw.child({ module, ...bindings })),
    isLevelEnabled: (level) => raw.isLevelEnabled(level),
    flush: () =>
      new Promise<void>((resolve) => {
        raw.flush(() => resolve());
      }),
  };
}

/**
 * 创建日志实例。
 *
 * - 开发环境默认使用 pino-pretty 彩色输出，生产环境输出 JSON 到 stdout，
 *   可用 `pretty` 显式覆盖；
 * - 每条日志固定带 `service` 与 `base` 字段，时间使用 ISO 字符串；
 * - `err` / `error` 字段通过 pino 标准序列化器展开为可读错误信息；
 * - 内置脱敏规则与调用方传入的 `redact` 合并；
 * - 通过 `child` / `scope` 派生带上下文的子日志。
 *
 * `service` 为空白字符串时直接抛错，避免日志缺少服务标识。
 */
export function createLogger(options: LoggerOptions): Logger {
  const {
    service,
    level = 'info',
    pretty = process.env.NODE_ENV !== 'production',
    base,
    redact,
    pinoOptions,
  } = options;

  const trimmedService = service.trim();
  if (!trimmedService) {
    throw new Error('createLogger: service 不能为空');
  }

  const raw = pino({
    level,
    base: { service: trimmedService, ...base },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    redact: {
      paths: [...DEFAULT_REDACT_PATHS, ...(redact ?? [])],
      censor: '[REDACTED]',
    },
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
              ignore: 'pid,hostname,service',
            },
          },
        }
      : {}),
    ...pinoOptions,
  });

  return wrap(raw);
}

/**
 * 供测试或特殊场景使用的空日志实现：所有级别均为 no-op，
 * `flush` 立即完成，派生出的 child / scope 同样是空实现。
 */
export function createNoopLogger(): Logger {
  const noop = (): void => undefined;
  return {
    raw: pino({ level: 'silent' }),
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => createNoopLogger(),
    scope: () => createNoopLogger(),
    isLevelEnabled: () => false,
    flush: () => Promise.resolve(),
  };
}
