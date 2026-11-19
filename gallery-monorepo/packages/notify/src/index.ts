/**
 * `@sylvie/notify` 包入口：导出公共类型、两个通道实现与通知门面。
 *
 * 使用方通常只需要 `createNotifier`（见 `notifier.ts`）；
 * 需要单独使用某个通道时可直接导入 `EmailChannel` / `SmsChannel`。
 */
export * from './types.js';
export { EmailChannel } from './email.js';
export { SmsChannel } from './sms.js';
export { Notifier, createNotifier } from './notifier.js';
