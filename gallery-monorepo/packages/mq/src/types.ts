import type { ConsumeMessage } from 'amqplib';

/** 轻量日志接口。 */
export interface MqLogger {
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

/** 创建消息队列的配置。 */
export interface MqOptions {
  /** AMQP 连接串，如 amqp://user:pass@host:5672。 */
  url: string;
  /** 每个 Channel 的预取数量，默认 1。 */
  prefetch?: number;
  /** 断线重连参数。 */
  recovery?: {
    initialDelayMs?: number;
    maxDelayMs?: number;
    factor?: number;
  };
  logger?: MqLogger;
}

/** 消费处理器：payload 为 JSON 解析后的值。 */
export type MqHandler<T = unknown> = (
  payload: T,
  message: ConsumeMessage,
) => Promise<void> | void;

/** 订阅选项。 */
export interface SubscribeOptions<T = unknown> {
  handler: MqHandler<T>;
  /** 处理器抛错时是否重新入队；默认 false，避免毒消息无限循环。 */
  requeueOnError?: boolean;
  /** payload 是否原样传 Buffer 而非 JSON 解析。 */
  raw?: boolean;
}
