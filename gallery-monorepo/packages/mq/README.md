# @sylvie/mq

RabbitMQ 封装（基于 amqplib 2.x），使用默认交换机 + 持久化队列，适合服务内异步事件与后台任务分发。

## 使用

```ts
import { createMessageQueue } from '@sylvie/mq';

const mq = createMessageQueue({
  url: 'amqp://sylvie:123456@127.0.0.1:5672',
  prefetch: 1,
  logger: console,
});

await mq.connect();

// 订阅（处理器抛错默认丢弃消息；传 requeueOnError: true 可重新入队）
await mq.subscribe<{ orderNo: string }>('sylvie.payment.paid', {
  handler: async (payload) => {
    await fulfillOrder(payload.orderNo);
  },
  requeueOnError: true,
});

// 发布（confirm 确认后才返回）
await mq.publish('sylvie.payment.paid', { orderNo: 'SV001' });

await mq.close();
```

## 设计要点

- **持久化**：队列 `durable`、消息 `persistent`，Broker 重启不丢失。
- **确认发布**：使用 ConfirmChannel，`publish` 返回前消息已写入 Broker。
- **自动重连**：依赖 amqplib 内置 recovery；断线后重建 Channel 并自动恢复所有订阅。
- **默认交换机**：routingKey 即队列名，无需额外维护 exchange/binding，适合单服务场景。
- **消费语义**：处理成功 `ack`；失败按 `requeueOnError` 决定 `nack`。毒消息建议保持默认丢弃并留日志。
- **日志注入**：包内不绑定日志实现，由调用方传入。

## 注意

- 处理器应幂等：重连、`requeueOnError` 都可能导致重复消费。
- 需要 topic/fanout 等复杂路由时，可在本包基础上扩展 exchange 配置。
