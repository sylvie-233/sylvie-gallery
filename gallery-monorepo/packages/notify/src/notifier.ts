/**
 * 通知门面：把邮件 / 短信通道组装成单一入口。
 *
 * 应用侧只需创建一个 `Notifier` 实例并在退出时调用 `close()`；
 * 通道是否可用由配置决定，未配置的通道发送时返回 `skipped=true`。
 * 门面本身不做重试与队列，重试 / 异步化应由调用方或任务层负责。
 */
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
 *
 * 两个通道按传入的配置独立创建：
 * - 只传 `email` 时短信发送返回 `skipped=true`，反之亦然；
 * - 通道未配置时对应发送方法返回 `skipped=true` 的结果，不抛错。
 */
export class Notifier {
  readonly email: EmailChannel | null;
  readonly sms: SmsChannel | null;

  constructor(options: NotifierOptions = {}) {
    const logger = options.logger ?? {};
    this.email = options.email ? new EmailChannel(options.email, logger) : null;
    this.sms = options.sms ? new SmsChannel(options.sms, logger) : null;
  }

  /**
   * 发送邮件；邮件通道未配置时直接返回 `skipped=true`。
   * @param message 邮件内容。
   */
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

  /**
   * 发送短信；短信通道未配置时直接返回 `skipped=true`。
   * @param message 短信内容（纯文本或模板参数）。
   */
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

  /** 是否至少有一个通道真正可用（已配置而非仅被创建）。 */
  get enabled(): boolean {
    return Boolean(this.email?.enabled || this.sms?.enabled);
  }

  /** 关闭底层连接；当前只涉及邮件连接池，短信由调用方自行管理。 */
  close(): void {
    this.email?.close();
  }
}

/**
 * 创建通知实例的快捷函数。
 * @param options 邮件 / 短信通道配置与日志实现，均可省略。
 */
export function createNotifier(options: NotifierOptions = {}): Notifier {
  return new Notifier(options);
}
