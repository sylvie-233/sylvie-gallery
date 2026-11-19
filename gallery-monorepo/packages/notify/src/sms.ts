/**
 * 短信通道：只负责参数校验、调用注入的 `SmsSender` 与结果归一化。
 *
 * 包内不绑定任何厂商 SDK：接入阿里云 / 腾讯云时，在应用侧实现 `send` 函数，
 * 通过 `SmsChannelOptions.send` 注入即可，本文件无需改动。
 * 未注入 `send` 时通道关闭，发送返回 `skipped=true`；发送失败同样只返回结果、不抛错。
 */
import type { NotifyLogger, SendResult, SmsChannelOptions, SmsMessage } from './types.js';

/**
 * 短信通道：具体服务商（阿里云 / 腾讯云等）由调用方通过 `send` 注入，
 * 包内不绑定任何厂商 SDK，后续接入时只需提供发送函数。
 */
export class SmsChannel {
  readonly enabled: boolean;
  private readonly sender?: SmsChannelOptions['send'];
  private readonly log: NotifyLogger;

  /**
   * @param options 短信配置；`send` 缺失时通道保持关闭。
   * @param logger 可选日志实现。
   */
  constructor(options: SmsChannelOptions | undefined, logger: NotifyLogger = {}) {
    this.sender = options?.send;
    this.log = logger;
    this.enabled = typeof this.sender === 'function';
  }

  /**
   * 发送短信：通道未配置时跳过，接收人或内容缺失时返回失败，
   * 调用服务商抛错时捕获并归一化为 `SendResult`，不向调用方抛出。
   */
  async send(message: SmsMessage): Promise<SendResult> {
    if (!this.sender) {
      this.log.debug?.('短信通道未配置，跳过发送', { to: message.to });
      return {
        channel: 'sms',
        ok: false,
        skipped: true,
        error: '短信通道未配置',
      };
    }
    if (!message.to || (!message.text && !message.templateId)) {
      return {
        channel: 'sms',
        ok: false,
        error: '短信接收人或内容不能为空',
      };
    }

    try {
      const result = await this.sender(message);
      this.log.info?.('短信已发送', { to: message.to, templateId: message.templateId });
      return { channel: 'sms', ok: true, messageId: result?.messageId };
    } catch (error) {
      this.log.error?.('短信发送失败', error, { to: message.to });
      return {
        channel: 'sms',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
