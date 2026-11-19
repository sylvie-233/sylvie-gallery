import { EmailChannel } from './email.js';
import { SmsChannel } from './sms.js';
import type {
  EmailMessage,
  NotifierOptions,
  SendResult,
  SmsMessage,
} from './types.js';

/**
 * 通知门面：统一管理邮件 / 短信通道。
 * 通道未配置时对应发送方法返回 `skipped=true` 的结果，不抛错。
 */
export class Notifier {
  readonly email: EmailChannel | null;
  readonly sms: SmsChannel | null;

  constructor(options: NotifierOptions = {}) {
    const logger = options.logger ?? {};
    this.email = options.email ? new EmailChannel(options.email, logger) : null;
    this.sms = options.sms ? new SmsChannel(options.sms, logger) : null;
  }

  sendEmail(message: EmailMessage): Promise<SendResult> {
    if (!this.email) {
      return Promise.resolve({
        channel: 'email',
        ok: false,
        skipped: true,
        error: '邮件通道未配置',
      });
    }
    return this.email.send(message);
  }

  sendSms(message: SmsMessage): Promise<SendResult> {
    if (!this.sms) {
      return Promise.resolve({
        channel: 'sms',
        ok: false,
        skipped: true,
        error: '短信通道未配置',
      });
    }
    return this.sms.send(message);
  }

  /** 是否至少配置了一个通道。 */
  get enabled(): boolean {
    return Boolean(this.email?.enabled || this.sms?.enabled);
  }

  /** 关闭底层连接。 */
  close(): void {
    this.email?.close();
  }
}

/** 创建通知实例。 */
export function createNotifier(options: NotifierOptions = {}): Notifier {
  return new Notifier(options);
}
