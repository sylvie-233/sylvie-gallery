/**
 * 通知层公共类型定义。
 *
 * 包内只描述「要发什么」与「发的结果」，不绑定任何邮件 / 短信服务商：
 * 邮件走标准 SMTP 参数，短信由调用方注入 {@link SmsSender} 实现。
 */

/**
 * 通知通道。
 * 每个通道独立配置、独立启停，互不影响。
 */
export type NotifyChannel = 'email' | 'sms';

/**
 * 轻量日志接口，避免包内绑定具体日志实现。
 * 应用侧通常用 `@sylvie/logger` 的 `moduleLogger()` 适配后注入。
 */
export interface NotifyLogger {
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

/**
 * 邮件内容。
 * `text` 为纯文本正文，`html` 可选；两者同时存在时由邮件客户端择优展示。
 */
export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

/**
 * 短信内容。
 * `text` 用于纯文本短信；`templateId` / `params` 供服务商模板短信使用。
 * 二者至少有其一，否则通道返回失败结果（不抛错）。
 */
export interface SmsMessage {
  to: string;
  text?: string;
  templateId?: string;
  params?: Record<string, string | number>;
}

/**
 * 发送结果。
 *
 * 所有发送方法都返回该结构而不抛异常：
 * - 通道未配置：`ok=false` 且 `skipped=true`，属于预期内的空操作；
 * - 发送失败：`ok=false` 且带 `error` 描述；
 * - 发送成功：`ok=true`，可能带服务商返回的 `messageId`。
 *
 * 调用方可以上报 `!ok`，但不应因此中断主业务。
 */
export interface SendResult {
  channel: NotifyChannel;
  ok: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
}

/**
 * 邮件通道配置。
 * 未提供 `host` 或 `from` 时通道关闭，发送返回 `skipped=true`。
 * 开发环境通常指向 Mailpit（`127.0.0.1:1025`），生产环境替换为真实 SMTP。
 */
export interface EmailChannelOptions {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  password?: string;
  /** 发件人，如 `希尔薇图集 <noreply@sylvie.cc>`。 */
  from: string;
  connectionTimeoutMs?: number;
  socketTimeoutMs?: number;
}

/**
 * 短信发送函数：由调用方注入具体服务商实现（阿里云 / 腾讯云等）。
 *
 * 约定：
 * - 成功时返回 `{ messageId }` 或 `void`；
 * - 失败时直接抛错，通道会捕获并转成 `SendResult`；
 * - 包内不依赖任何厂商 SDK，接入新服务商无需改动本包。
 */
export type SmsSender = (
  message: SmsMessage,
) => Promise<{ messageId?: string } | void>;

/** 短信通道配置；未提供 `send` 时通道关闭，发送返回 `skipped=true`。 */
export interface SmsChannelOptions {
  send: SmsSender;
}

/**
 * 创建 `Notifier` 的配置。
 * 两个通道均可选；都不传时创建出的实例 `enabled=false`，发送一律返回 `skipped=true`。
 */
export interface NotifierOptions {
  email?: EmailChannelOptions;
  sms?: SmsChannelOptions;
  logger?: NotifyLogger;
}
