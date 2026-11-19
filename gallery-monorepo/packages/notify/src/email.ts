/**
 * 邮件通道：基于 nodemailer 的 SMTP 发送实现。
 *
 * - 是否启用由 `host` 与 `from` 是否存在决定，未配置时发送返回 `skipped=true`；
 * - 兼容 Mailpit、企业邮箱与云邮件服务，连接 / 读写超时默认 5 秒；
 * - 发送失败只记录日志并返回 `ok=false`，不会向调用方抛错。
 */
import nodemailer, { type Transporter } from 'nodemailer';

import type {
  EmailChannelOptions,
  EmailMessage,
  NotifyLogger,
  SendResult,
} from './types.js';

/** SMTP 邮件通道（兼容 Mailpit / 企业邮箱 / 云邮件服务）。 */
export class EmailChannel {
  readonly enabled: boolean;
  private readonly options: EmailChannelOptions;
  private readonly log: NotifyLogger;
  private transporter: Transporter | null = null;

  /**
   * @param options SMTP 连接参数与默认发件人。
   * @param logger 可选日志实现；不传则不输出日志。
   */
  constructor(options: EmailChannelOptions, logger: NotifyLogger = {}) {
    this.options = options;
    this.log = logger;
    this.enabled = Boolean(options.host && options.from);
  }

  /**
   * 发送邮件；通道未配置时跳过，失败只返回结果，不抛出。
   * @param message 收件人、主题与正文。
   * @returns 统一发送结果；成功时 `messageId` 来自 SMTP 响应。
   */
  async send(message: EmailMessage): Promise<SendResult> {
    if (!this.enabled) {
      this.log.debug?.('邮件通道未配置，跳过发送', { to: message.to });
      return {
        channel: 'email',
        ok: false,
        skipped: true,
        error: '邮件通道未配置',
      };
    }

    const recipients = Array.isArray(message.to) ? message.to : [message.to];
    try {
      const info = await this.getTransporter().sendMail({
        from: this.options.from,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      this.log.info?.('邮件已发送', {
        to: recipients.join(','),
        subject: message.subject,
      });
      return { channel: 'email', ok: true, messageId: info.messageId };
    } catch (error) {
      this.log.error?.('邮件发送失败', error, {
        to: recipients.join(','),
        subject: message.subject,
      });
      return {
        channel: 'email',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** 关闭连接池并释放底层连接；可重复调用。 */
  close(): void {
    this.transporter?.close();
    this.transporter = null;
  }

  /**
   * 懒创建并复用 transporter，避免每个进程重复建立 SMTP 连接。
   * 有用户名时启用 SMTP 认证，否则匿名发送（适合 Mailpit）。
   */
  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.options.host,
        port: this.options.port ?? 1025,
        secure: this.options.secure ?? false,
        auth: this.options.user
          ? { user: this.options.user, pass: this.options.password }
          : undefined,
        connectionTimeout: this.options.connectionTimeoutMs ?? 5000,
        socketTimeout: this.options.socketTimeoutMs ?? 5000,
      });
    }
    return this.transporter;
  }
}
