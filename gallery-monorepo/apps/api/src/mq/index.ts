import { createMessageQueue, type MessageQueue } from '@sylvie/mq';

import { env } from '../config/env.js';
import { scheduleVipExpiryNotice } from '../jobs/index.js';
import { fulfillVipOrder } from '../services/order.service.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('mq');

/** 支付成功事件。 */
export interface PaymentPaidEvent {
  orderNo: string;
  tradeNo: string;
  amountCents: number | null;
}

/** 队列名：默认交换机下 routingKey 与队列名一致。 */
export const paymentPaidQueue = `${env.MQ_QUEUE_PREFIX}.payment.paid`;

export const mqEnabled = env.MQ_ENABLED === 'true';

let mq: MessageQueue | null = null;

/** 消费支付成功事件：履约 + 登记会员到期通知（两者均幂等）。 */
async function handlePaymentPaid(payload: PaymentPaidEvent): Promise<void> {
  if (!payload?.orderNo) {
    throw new Error('支付事件缺少 orderNo');
  }

  const result = await fulfillVipOrder(
    payload.orderNo,
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

/** 启动 MQ 连接与消费者；失败不阻断 API 启动。 */
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

/** 发布支付成功事件；未启用或不可用时返回 false，由调用方走同步履约。 */
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

/** MQ 是否可用；未启用视为正常。 */
export function mqHealthy(): boolean {
  return !mqEnabled || Boolean(mq?.healthy());
}

/** 关闭 MQ 连接。 */
export async function stopMq(): Promise<void> {
  await mq?.close().catch(() => undefined);
  mq = null;
}
