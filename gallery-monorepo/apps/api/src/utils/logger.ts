/**
 * 日志实例装配：统一服务名、日志级别与开发彩色输出，
 * 并提供按模块派生子日志的入口。
 */
import { createLogger, type Logger } from '@sylvie/logger';

import { env } from '../config/env.js';
import { observability } from '../observability/index.js';

const pretty = env.LOG_PRETTY === 'true' ? true : env.LOG_PRETTY === 'false' ? false : undefined;

/** 应用级日志实例：服务名固定为 `sylvie-api`，每条日志自动携带链路字段。 */
export const logger = createLogger({
  service: 'sylvie-api',
  level: env.LOG_LEVEL,
  pretty,
  mixin: () => observability.traceLogFields(),
});

/** 获取带模块标记的子日志：`moduleLogger('album').info(...)`。 */
export function moduleLogger(module: string): Logger {
  return logger.scope(module);
}
