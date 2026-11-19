/**
 * @sylvie/mq 公共类型定义。
 *
 * 包含连接配置、消费处理器与订阅选项。日志接口以可选方法声明，
 * 包内不绑定具体日志实现，由调用方注入。
 */
import type { ConsumeMessage } from 'amqplib';

/**
 * 轻量日志接口。
 *
 * 所有方法均为可选；未注入时包内静默处理，`error` 额外接收原始错误对象。
 */
export interface MqLogger {
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

/**
 * 创建消息队列的配置。
 *
 * 队列名不在配置中声明：本包使用默认交换机，发布 / 订阅时传入的队列名
 * 即 routingKey，队列在首次使用时声明为 durable。
 */
export interface MqOptions {
  /** AMQP 连接串，如 `amqp://user:pass@host:5672`。 */
  url: string;
  /** 每个 Channel 的预取数量，默认 1；决定单个消费者的未确认消息上限。 */
  prefetch?: number;
  /**
   * 断线重连参数（指数退避，另带 20% 抖动）。
   *
   * 三个字段均有默认值：初始 500ms、上限 5000ms、倍数 2。
   */
  recovery?: {
    initialDelayMs?: number;
    maxDelayMs?: number;
    factor?: number;
  };
  logger?: MqLogger;
}

/**
 * 消费处理器：payload 为 JSON 解析后的值。
 *
 * 第二个参数为原始 amqplib 消息，可用于读取 `messageId`、headers 等元数据。
 * 处理器返回即视为处理成功（ack），抛错则按 `requeueOnError` 决定 nack 行为。
 */
export type MqHandler<T = unknown> = (
  payload: T,
  message: ConsumeMessage,
) => Promise<void> | void;

/**
 * 订阅选项。
 *
 * 同一队列重复订阅时以最后一次配置为准；处理器需自行保证幂等。
 */
export interface SubscribeOptions<T = unknown> {
  handler: MqHandler<T>;
  /** 处理器抛错时是否重新入队；默认 false，避免毒消息无限循环。 */
  requeueOnError?: boolean;
  /** payload 是否原样传 Buffer 而非 JSON 解析。 */
  raw?: boolean;
}
