/**
 * @sylvie/job 公共入口。
 *
 * 对外导出任务类型定义（`types.ts`）与基于 BullMQ 的队列封装（`queue.ts`）。
 * 使用方通过 `createJobQueue` 创建实例，并在同一队列名上启动 Worker。
 */
export * from './types.js';
export { JobQueue, createJobQueue } from './queue.js';
