/**
 * @sylvie/mq 公共入口。
 *
 * 对外导出消息队列类型定义（`types.ts`）与基于 amqplib 的封装（`queue.ts`）。
 * 使用方通过 `createMessageQueue` 创建实例，再 `connect` / `subscribe` / `publish`。
 */
export * from './types.js';
export { MessageQueue, createMessageQueue } from './queue.js';
