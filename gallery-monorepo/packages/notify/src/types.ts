/** 通知通道。 */
export type NotifyChannel = 'email' | 'sms';

/** 轻量日志接口，避免包内绑定具体日志实现。 */
export interface NotifyLogger {
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

/** 邮件内容。 */
export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

/** 短信内容；`templateId` / `params` 供服务商模板短信使用。 */
export interface SmsMessage {
  to: string;
  text?: string;
  templateId?: string;
  params?: Record<string, string | number>;
}

/** 发送结果：通道未配置时 `skipped=true`，发送失败时 `ok=false`。 */
export interface SendResult {
  channel: NotifyChannel;
  ok: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
}

/** 邮件通道配置；未提供 host 时通道关闭。 */
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

/** 短信发送函数：由调用方注入具体服务商实现。 */
export type SmsSender = (
  message: SmsMessage,
) => Promise<{ messageId?: string } | void>;

/** 短信通道配置；未提供 sender 时通道关闭。 */
export interface SmsChannelOptions {
  send: SmsSender;
}

/** 创建 Notifier 的配置。 */
export interface NotifierOptions {
  email?: EmailChannelOptions;
  sms?: SmsChannelOptions;
  logger?: NotifyLogger;
}
