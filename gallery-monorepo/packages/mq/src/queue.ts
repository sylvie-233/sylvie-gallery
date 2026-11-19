/**
 * 基于 amqplib 的 RabbitMQ 消息队列实现。
 *
 * 职责：
 * - 连接 Broker、创建 ConfirmChannel，并在断线重连后重建 Channel、恢复订阅；
 * - 以默认交换机发布 JSON 消息到指定队列（队列名即 routingKey）；
 * - 订阅队列并以手动 ack / nack 的语义消费消息。
 *
 * 本文件只做传输编排，不含业务逻辑；业务处理器由调用方注入，
 * 并需自行保证幂等（重连与重试都可能导致重复投递）。
 */
import * as amqp from 'amqplib';
import type { ConfirmChannel, ConsumeMessage, RecoveringChannelModel } from 'amqplib';

import type { MqHandler, MqOptions, SubscribeOptions } from './types.js';

/**
 * 内部订阅记录：保存处理器与消费选项。
 *
 * 订阅表以队列名为键常驻内存，Channel 重建时据此恢复全部消费者，
 * 因此 `subscribe` 在断线期间调用也不会丢失。
 */
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
 *
 * 消费语义：
 * - 消费者以 `noAck: false` 订阅，处理器成功返回后 `ack`；
 * - 处理器抛错时 `nack`，是否重新入队由订阅选项 `requeueOnError` 决定
 *   （默认 false，防止毒消息无限循环）。
 *
 * 幂等要求：自动重连、重连后的重复投递、`requeueOnError` 都可能让同一消息
 * 被处理多次，处理器必须按业务键（如订单号）做幂等。
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

  /**
   * 建立连接并创建 Channel；重复调用只初始化一次。
   *
   * 连接使用 amqplib 内置 recovery（指数退避 + 抖动）。监听 `connect` 事件，
   * 每次（重）连接成功后都会调用 `setupChannel` 重建 Channel 并恢复订阅。
   */
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

  /**
   * 创建（或重建）Channel，并恢复全部订阅。
   *
   * 并发调用共享同一个 `setupPromise`，避免重连瞬间重复建 Channel。
   * 新建 Channel 后清空已声明队列缓存并重新 `prefetch`，再按订阅表逐个
   * 重新 `consume`，从而实现订阅自动恢复。
   */
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

  /**
   * 发布 JSON 消息到指定队列；confirm 确认后返回。
   *
   * 使用默认交换机：`sendToQueue` 的队列名即 routingKey，无需维护 exchange
   * 与 binding。消息以 `persistent: true` 发送，队列在首次使用时就地声明为
   * durable；`waitForConfirms` 返回后才算发布成功。
   *
   * @throws 连接 / Channel 不可用或 Broker 未确认时抛错，由调用方决定补偿。
   */
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

  /**
   * 订阅队列；处理器抛错时按 `requeueOnError` 决定是否重新入队。
   *
   * 订阅会记录到内存表：Channel 尚未就绪时先登记，待连接 / 重连成功后
   * 由 `setupChannel` 统一恢复。同一队列重复订阅会以最后一次配置为准，
   * 但不会主动取消已有的消费者，请避免对同一队列重复调用。
   *
   * 处理器需幂等；详见类注释中的消费语义。
   */
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

  /**
   * 连接与 Channel 是否可用。
   *
   * 只反映本地客户端状态，不做网络探测；断线期间 amqplib 会进入 recovery，
   * 此时通常返回 false，待重建 Channel 后恢复。
   */
  healthy(): boolean {
    return Boolean(this.model && this.channel);
  }

  /**
   * 关闭消费者、Channel 与连接。
   *
   * 先置 `closing` 标记，阻止重连回调再次创建 Channel 或恢复订阅；
   * 关闭过程中的异常会被忽略，并清空订阅表。关闭后实例不应再被复用。
   */
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

  /**
   * 获取可用的 ConfirmChannel。
   *
   * 未连接时先建立连接；若正处于建 Channel 过程中则等待其完成；
   * 仍不可用时再尝试重建一次。最终失败抛出明确错误，避免静默丢消息。
   */
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

  /**
   * 就地声明队列（幂等）。
   *
   * 队列参数固定为 `durable: true`，即默认交换机下以队列名作为 routingKey。
   * 已声明过的队列按 Channel 生命周期缓存，Channel 重建后缓存清空并重新声明。
   */
  private async assertQueue(channel: ConfirmChannel, queue: string): Promise<void> {
    if (this.assertedQueues.has(queue)) {
      return;
    }
    await channel.assertQueue(queue, { durable: true });
    this.assertedQueues.add(queue);
  }

  /**
   * 在指定 Channel 上声明队列并开始消费。
   *
   * 使用 `noAck: false` 手动确认；消息处理交给 `handleMessage`，
   * 不阻塞不同消息之间的并发消费（并发度由 `prefetch` 控制）。
   */
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

  /**
   * 处理单条消息并完成确认。
   *
   * 默认将消息体按 JSON 解析（`raw: true` 时原样传 Buffer）。处理器成功返回后
   * `ack`；抛错时记录日志并 `nack`，`requeueOnError` 为 true 则重新入队，
   * 否则丢弃（毒消息由日志排查）。
   *
   * 注意：重新入队会立即再次投递，处理器应保证幂等，并避免在可预见的
   * 永久性错误上开启 `requeueOnError`。
   */
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

/**
 * 创建消息队列实例。
 *
 * 仅保存配置，不建立连接；需显式调用 `connect()`，或由首次
 * `publish` / `subscribe` 触发懒连接。
 */
export function createMessageQueue(options: MqOptions): MessageQueue {
  return new MessageQueue(options);
}
