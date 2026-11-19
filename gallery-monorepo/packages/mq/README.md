# @sylvie/mq

基于 [amqplib](https://amqp-node.github.io/amqplib/) 2.x 的共享消息队列层，使用**默认交换机 + 持久化队列**，适合服务内异步事件与后台任务分发。包内只做连接、发布与消费编排，不包含业务逻辑。

## 定位

- 为 API 提供统一的 RabbitMQ 发布 / 订阅能力，用于支付成功等异步事件。
- 默认交换机模式下队列名即 routingKey，无需维护 exchange 与 binding。
- 持久化队列与消息，Broker 重启不丢失；发布使用 ConfirmChannel，确认落盘后才返回。
- 不绑定日志实现，由调用方注入 `{ debug, info, warn, error }`。
- 依赖 **RabbitMQ**；未部署时不要启用 MQ，调用方需准备同步兜底路径。

## 目录结构

```
packages/mq/
├── src/
│   ├── index.ts   # 公共入口：导出类型与 MessageQueue / createMessageQueue
│   ├── queue.ts   # amqplib 封装：连接、确认发布、订阅、ack/nack、重连恢复、关闭
│   └── types.ts   # 公共类型：连接配置、处理器、订阅选项
├── package.json
├── tsconfig.json
└── eslint.config.js
```

## 引入方式

在 workspace 内的应用包中添加依赖：

```json
{
  "dependencies": {
    "@sylvie/mq": "workspace:*"
  }
}
```

```ts
import { createMessageQueue, type MessageQueue } from '@sylvie/mq';
```

注意：`@sylvie/mq` 使用 `"type": "module"`，仅提供 ESM 入口（`dist/index.js`），并随 `dist/index.d.ts` 提供类型。

## 快速开始

```ts
import { createMessageQueue } from '@sylvie/mq';

const mq = createMessageQueue({
  url: 'amqp://sylvie:123456@127.0.0.1:5672',
  prefetch: 1,
  logger: {
    info: (message, meta) => console.info(message, meta),
    error: (message, error, meta) => console.error(message, error, meta),
  },
});

await mq.connect();

// 订阅：payload 默认按 JSON 解析；处理器抛错默认丢弃消息，
// 传 requeueOnError: true 则重新入队
await mq.subscribe<{ orderNo: string }>('sylvie.payment.paid', {
  handler: async (payload) => {
    await fulfillOrder(payload.orderNo);
  },
  requeueOnError: true,
});

// 发布：ConfirmChannel 确认后才返回
await mq.publish('sylvie.payment.paid', { orderNo: 'SV001' });

// 健康检查与关闭
const ok = mq.healthy();
await mq.close();
```

## API 概览

| 成员 | 签名 | 说明 |
|---|---|---|
| `createMessageQueue` | `(options: MqOptions) => MessageQueue` | 创建实例；仅保存配置，不建立连接 |
| `mq.connect` | `() => Promise<void>` | 建立连接并创建 ConfirmChannel；重复调用只初始化一次 |
| `mq.publish` | `(queue: string, payload: unknown) => Promise<void>` | 发布 JSON 到队列，confirm 确认后返回 |
| `mq.subscribe` | `<T>(queue: string, options: SubscribeOptions<T>) => Promise<void>` | 订阅队列；Channel 未就绪时先登记，连接后恢复 |
| `mq.healthy` | `() => boolean` | 本地连接与 Channel 是否可用（不做网络探测） |
| `mq.close` | `() => Promise<void>` | 关闭消费者、Channel 与连接，并清空订阅 |

`SubscribeOptions`：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `handler` | `(payload, message) => Promise<void> \| void` | — | 消费处理器；第二个参数为原始 amqplib 消息 |
| `requeueOnError` | `boolean` | `false` | 处理器抛错时是否重新入队 |
| `raw` | `boolean` | `false` | payload 是否原样传 Buffer 而非 JSON 解析 |

## 设计边界

- **默认交换机**：`sendToQueue(queue)` 直接以队列名为 routingKey，不声明 exchange / binding；需要 topic、fanout 等复杂路由时应在业务侧扩展，而不是修改本包语义。
- **持久化**：队列首次使用时以 `durable: true` 声明，消息以 `persistent: true` 发送。
- **确认发布**：所有 Channel 均为 ConfirmChannel；`publish` 内部调用 `waitForConfirms()`，Broker 未确认时抛错，由调用方决定补偿。
- **手动确认消费**：订阅使用 `noAck: false`；处理器成功返回后 `ack`，抛错后 `nack`，`requeueOnError` 决定是否重新入队。
- **自动重连与订阅恢复**：连接启用 amqplib 内置 recovery；断线后指数退避重连，重连成功后重建 Channel、重新 `prefetch` 并按内存订阅表恢复全部消费者。
- **并发控制**：单 Channel 的未确认消息上限由 `prefetch` 控制，默认 1（逐条处理）。
- **不保证业务幂等**：重复投递是 AMQP 的正常语义，去重与幂等由处理器负责。

## 配置项

`MqOptions`：

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `url` | `string` | 是 | — | AMQP 连接串，如 `amqp://user:pass@host:5672` |
| `prefetch` | `number` | 否 | `1` | 每个 Channel 的预取数量 |
| `recovery.initialDelayMs` | `number` | 否 | `500` | 首次重连延迟 |
| `recovery.maxDelayMs` | `number` | 否 | `5000` | 重连延迟上限 |
| `recovery.factor` | `number` | 否 | `2` | 退避倍数（另带 20% 抖动） |
| `logger` | `MqLogger` | 否 | 空实现 | 日志注入，方法均可选 |

## 与 API 集成位置

API 侧入口为 `apps/api/src/mq/index.ts`，是唯一的 `@sylvie/mq` 使用方：

- 队列名：`paymentPaidQueue = `${env.MQ_QUEUE_PREFIX}.payment.paid``，默认 `sylvie.payment.paid`。
- `MQ_ENABLED=true` 时 `startMq()` 连接并订阅支付成功事件；`MQ_PREFETCH` 控制预取数，处理器使用 `requeueOnError: true`。
- 消费端 `handlePaymentPaid` 调用 `fulfillVipOrder` 履约，再通过 `scheduleVipExpiryNotice` 登记会员到期延时通知；两者均幂等。
- `publishPaymentPaid(event)` 返回是否成功入队；返回 `false` 时调用方必须改为同步履约，避免「支付成功但权益未开通」。
- `mqHealthy()` 供健康检查使用，未启用 MQ 时视为正常；`stopMq()` 在进程退出时关闭连接。
- MQ 启动或发布失败只记录日志，不阻断 API 启动，降级为同步履约。

相关环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `MQ_ENABLED` | `false` | 是否启用 MQ；关闭时发布直接返回 `false` |
| `MQ_URL` | `amqp://sylvie:123456@127.0.0.1:5672` | AMQP 连接串 |
| `MQ_QUEUE_PREFIX` | `sylvie` | 队列名前缀 |
| `MQ_PREFETCH` | `1` | 消费者预取数量 |

## 注意事项

- **幂等**：自动重连、`requeueOnError` 与 Broker 重投都可能导致同一消息被处理多次，处理器必须按业务键（如订单号）幂等。
- **毒消息**：可预见的永久性错误不建议开启 `requeueOnError`，否则会立即反复重投；默认 `false` 会丢弃并记录日志，便于排查。
- **队列名即路由键**：发布与订阅必须使用完全一致的队列名；不同服务共用 Broker 时请加业务前缀（本项目使用 `MQ_QUEUE_PREFIX`）。
- **RabbitMQ 依赖**：连接期间的发布 / 订阅可能等待，调用方应为关键链路准备同步兜底；`healthy()` 只反映本地状态。
- **消息格式**：`publish` 总是序列化为 JSON；订阅默认按 JSON 解析，非 JSON 消息需使用 `raw: true`。
- **关闭**：进程退出前调用 `close()`；关闭后实例不可复用。
