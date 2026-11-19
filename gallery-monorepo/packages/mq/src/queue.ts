import * as amqp from 'amqplib';
import type { ConfirmChannel, ConsumeMessage, RecoveringChannelModel } from 'amqplib';

import type { MqHandler, MqOptions, SubscribeOptions } from './types.js';

/** 内部订阅记录。 */
interface Subscription {
  handler: MqHandler;
  requeueOnError: boolean;
  raw: boolean;
}

/**
 * RabbitMQ 封装：
 * - 使用默认交换机（routingKey 即队列名），持久化队列 + 持久化消息；
 * - amqplib 自带 recovery，断线后自动重连并重建 Channel、重新订阅；
 * - publish 使用 confirm channel，`publish` 返回前消息已确认落盘。
 */
export class MessageQueue {
  private model: RecoveringChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly assertedQueues = new Set<string>();
  private readonly options: MqOptions;
  private setupPromise: Promise<void> | null = null;
  private closing = false;

  constructor(options: MqOptions) {
    this.options = options;
  }

  /** 建立连接并创建 Channel；重复调用只初始化一次。 */
  async connect(): Promise<void> {
    if (this.model) {
      return;
    }
    const recovery = this.options.recovery ?? {};
    const model = (await amqp.connect(this.options.url, {
      recovery: {
        initialDelay: recovery.initialDelayMs ?? 500,
        maxDelay: recovery.maxDelayMs ?? 5000,
        factor: recovery.factor ?? 2,
        jitter: 0.2,
      },
    } as never)) as unknown as RecoveringChannelModel;

    this.model = model;
    model.on('connect', () => {
      this.options.logger?.info?.('RabbitMQ 已连接');
      void this.setupChannel();
    });
    model.on('disconnect', (error: Error) => {
      this.options.logger?.warn?.('RabbitMQ 连接断开，等待自动重连', {
        error: error.message,
      });
    });
    model.on('reconnect-failed', (error: Error) => {
      this.options.logger?.error?.('RabbitMQ 重连失败', error);
    });
    model.on('error', (error: Error) => {
      this.options.logger?.error?.('RabbitMQ 连接异常', error);
    });

    await this.setupChannel();
  }

  /** 创建（或重建）Channel，并恢复全部订阅。 */
  private async setupChannel(): Promise<void> {
    if (!this.model || this.closing) {
      return;
    }
    if (this.setupPromise) {
      return this.setupPromise;
    }

    this.setupPromise = (async () => {
      const channel = await this.model!.createConfirmChannel();
      channel.on('error', (error) => {
        this.options.logger?.error?.('RabbitMQ Channel 异常', error);
      });
      channel.on('close', () => {
        if (this.channel === channel) {
          this.channel = null;
        }
      });

      this.channel = channel;
      this.assertedQueues.clear();
      await channel.prefetch(this.options.prefetch ?? 1);

      for (const [queue, subscription] of this.subscriptions) {
        await this.consumeOn(channel, queue, subscription);
      }

      this.options.logger?.info?.('RabbitMQ Channel 就绪', {
        subscriptions: this.subscriptions.size,
      });
    })().finally(() => {
      this.setupPromise = null;
    });

    return this.setupPromise;
  }

  /** 发布 JSON 消息到指定队列；confirm 确认后返回。 */
  async publish(queue: string, payload: unknown): Promise<void> {
    const channel = await this.ensureChannel();
    await this.assertQueue(channel, queue);

    const body = Buffer.from(JSON.stringify(payload));
    const accepted = channel.sendToQueue(queue, body, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
    });
    await channel.waitForConfirms();

    this.options.logger?.debug?.('消息已发布', {
      queue,
      size: body.byteLength,
      accepted,
    });
  }

  /** 订阅队列；处理器抛错时按 `requeueOnError` 决定是否重新入队。 */
  async subscribe<T = unknown>(queue: string, options: SubscribeOptions<T>): Promise<void> {
    this.subscriptions.set(queue, {
      handler: options.handler as MqHandler,
      requeueOnError: options.requeueOnError ?? false,
      raw: options.raw ?? false,
    });

    if (this.channel) {
      await this.consumeOn(this.channel, queue, this.subscriptions.get(queue)!);
    }
  }

  /** 连接与 Channel 是否可用。 */
  healthy(): boolean {
    return Boolean(this.model && this.channel);
  }

  /** 关闭消费者、Channel 与连接。 */
  async close(): Promise<void> {
    this.closing = true;
    try {
      await this.channel?.close();
    } catch {
      // 已断开时忽略。
    }
    try {
      await this.model?.close();
    } catch {
      // 已断开时忽略。
    }
    this.channel = null;
    this.model = null;
    this.subscriptions.clear();
    this.assertedQueues.clear();
  }

  private async ensureChannel(): Promise<ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }
    if (!this.model) {
      await this.connect();
    }
    if (this.setupPromise) {
      await this.setupPromise;
    }
    if (!this.channel) {
      await this.setupChannel();
    }
    if (!this.channel) {
      throw new Error('RabbitMQ Channel 不可用');
    }
    return this.channel;
  }

  private async assertQueue(channel: ConfirmChannel, queue: string): Promise<void> {
    if (this.assertedQueues.has(queue)) {
      return;
    }
    await channel.assertQueue(queue, { durable: true });
    this.assertedQueues.add(queue);
  }

  private async consumeOn(
    channel: ConfirmChannel,
    queue: string,
    subscription: Subscription,
  ): Promise<void> {
    await this.assertQueue(channel, queue);
    await channel.consume(
      queue,
      (message) => {
        void this.handleMessage(channel, queue, subscription, message);
      },
      { noAck: false },
    );
  }

  private async handleMessage(
    channel: ConfirmChannel,
    queue: string,
    subscription: Subscription,
    message: ConsumeMessage | null,
  ): Promise<void> {
    if (!message) {
      return;
    }

    try {
      const payload = subscription.raw
        ? message.content
        : (JSON.parse(message.content.toString('utf8')) as unknown);
      await subscription.handler(payload, message);
      channel.ack(message);
    } catch (error) {
      this.options.logger?.error?.('消息处理失败', error, {
        queue,
        messageId: message.properties.messageId,
        requeue: subscription.requeueOnError,
      });
      channel.nack(message, false, subscription.requeueOnError);
    }
  }
}

/** 创建消息队列实例。 */
export function createMessageQueue(options: MqOptions): MessageQueue {
  return new MessageQueue(options);
}
