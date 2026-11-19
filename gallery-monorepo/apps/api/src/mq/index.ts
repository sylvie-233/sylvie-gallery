/**
 * 支付消息队列入口（RabbitMQ）：
 * 支付成功事件通过持久化队列异步履约；MQ 未启用或不可用时，
 * 调用方按 `publishPaymentPaid` 的返回值退化为同步履约。
 */
import { createMessageQueue, type MessageQueue } from '@sylvie/mq';

import { env } from '../config/env.js';
import { scheduleVipExpiryNotice } from '../jobs/index.js';
import { fulfillVipOrder } from '../services/order.service.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('mq');

/**
 * 支付成功事件负载。
 * `amountCents` 单位为分，未知时为 null；`tradeNo` 为支付宝交易流水号，
 * 缺失时消费端会生成占位流水号。
 */
export interface PaymentPaidEvent {
  orderNo: string;
  tradeNo: string;
  amountCents: number | null;
}

/**
 * 支付成功队列名：默认交换机下 routingKey 与队列名一致，
 * 实际名称带 `MQ_QUEUE_PREFIX` 前缀（默认 `sylvie.payment.paid`）。
 */
export const paymentPaidQueue = `${env.MQ_QUEUE_PREFIX}.payment.paid`;

/** 是否启用 MQ（MQ_ENABLED=true）；关闭时发布直接返回 false，由调用方同步履约。 */
export const mqEnabled = env.MQ_ENABLED === 'true';

let mq: MessageQueue | null = null;

/**
 * 消费支付成功事件：调用 `fulfillVipOrder` 开通 / 续费会员，
 * 再登记会员到期延时通知。两者均按订单号 / userId 幂等，
 * 因此消息重复投递不会重复开通或叠加时长。
 *
 * 处理失败会抛错，由订阅方的 `requeueOnError` 重新入队重试。
 */
async function handlePaymentPaid(payload: PaymentPaidEvent): Promise<void> {
  if (!payload?.orderNo) {
    throw new Error('支付事件缺少 orderNo');
  }

  const result = await fulfillVipOrder(
    payload.orderNo,
    // 流水号缺失时用时间戳生成占位值，保证订单仍可履约。
    payload.tradeNo || `ALIPAY${Date.now()}`,
    payload.amountCents,
  );
  await scheduleVipExpiryNotice(result.userId);

  log.info('支付事件处理完成', {
    orderNo: payload.orderNo,
    userId: result.userId,
    already: result.already,
  });
}

/**
 * 启动 MQ 连接并订阅支付成功队列。
 *
 * 副作用：建立 AMQP 连接（断线由 amqplib recovery 自动重连并恢复订阅）、
 * 声明持久化队列并开始消费。启动失败只记录日志并清理连接，不阻断 API 启动；
 * 此时支付通知由调用方走同步履约。
 */
export async function startMq(): Promise<void> {
  if (!mqEnabled) {
    log.info('消息队列未启用（MQ_ENABLED=false）');
    return;
  }

  const instance = createMessageQueue({
    url: env.MQ_URL,
    prefetch: env.MQ_PREFETCH,
    logger: {
      debug: (message, meta) => log.debug(message, meta),
      info: (message, meta) => log.info(message, meta),
      warn: (message, meta) => log.warn(message, meta),
      error: (message, error, meta) => log.error(message, error, meta),
    },
  });

  try {
    await instance.connect();
    await instance.subscribe<PaymentPaidEvent>(paymentPaidQueue, {
      handler: handlePaymentPaid,
      // 处理失败重新入队，依赖履约与通知登记的幂等性避免重复开通。
      requeueOnError: true,
    });
    mq = instance;
    log.info('消息队列已启动', { queue: paymentPaidQueue });
  } catch (error) {
    log.error('消息队列启动失败，支付通知将走同步履约', error);
    await instance.close().catch(() => undefined);
    mq = null;
  }
}

/**
 * 发布支付成功事件到持久化队列（confirm 模式，确认落盘后返回）。
 *
 * @returns 是否成功入队。未启用、连接不可用或发布异常时返回 false，
 *          调用方必须改为同步调用履约逻辑，避免支付成功但权益未开通。
 */
export async function publishPaymentPaid(event: PaymentPaidEvent): Promise<boolean> {
  if (!mqEnabled || !mq?.healthy()) {
    return false;
  }
  try {
    await mq.publish(paymentPaidQueue, event);
    return true;
  } catch (error) {
    log.error('支付事件发布失败，将走同步履约', error, { orderNo: event.orderNo });
    return false;
  }
}

/** MQ 连接与 Channel 是否可用；未启用 MQ 时视为正常，供健康检查使用。 */
export function mqHealthy(): boolean {
  return !mqEnabled || Boolean(mq?.healthy());
}

/** 关闭 MQ 消费者与连接，忽略关闭过程中的错误（进程退出时调用）。 */
export async function stopMq(): Promise<void> {
  await mq?.close().catch(() => undefined);
  mq = null;
}
