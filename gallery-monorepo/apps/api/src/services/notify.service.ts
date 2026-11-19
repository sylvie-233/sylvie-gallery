/**
 * 应用级通知服务（邮件 / 短信）：
 * 邮件通道按 SMTP 配置启用，开发环境由 Mailpit 捕获；
 * 通道未配置或发送失败只记录日志，不阻断注册、找回密码等业务流程。
 */
import { createNotifier } from '@sylvie/notify';

import { env } from '../config/env.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('notify');

/**
 * 应用级通知实例：
 * - 配置 `SMTP_HOST` 时启用邮件通道（开发环境为 Mailpit）；为空时邮件通道关闭，
 *   发送返回 `skipped=true` 而不抛错，调用方无需特殊处理；
 * - 短信通道暂未配置，接入服务商后在 `sms.send` 中注入 `SmsSender` 实现即可。
 */
export const notifier = createNotifier({
  email: env.SMTP_HOST
    ? {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE === 'true',
        user: env.SMTP_USER || undefined,
        password: env.SMTP_PASSWORD || undefined,
        from: env.SMTP_FROM,
      }
    : undefined,
  logger: {
    debug: (message, meta) => log.debug(message, meta),
    info: (message, meta) => log.info(message, meta),
    warn: (message, meta) => log.warn(message, meta),
    error: (message, error, meta) => log.error(message, error, meta),
  },
});

/**
 * 发送邮箱验证码（注册 / 找回密码）。
 *
 * @param email 收件邮箱。
 * @param code 验证码明文。
 * @param scene 场景，决定邮件文案（注册账号 / 重置密码）。
 * @param ttlMinutes 有效期（分钟），仅用于文案展示。
 * @returns 是否发送成功；通道未配置或发送失败均返回 false，
 *          异常已被通道捕获，不会抛错阻断主流程。
 */
export async function sendVerifyCodeMail(
  email: string,
  code: string,
  scene: 'register' | 'reset_password',
  ttlMinutes: number,
): Promise<boolean> {
  const action = scene === 'register' ? '注册账号' : '重置密码';
  const result = await notifier.sendEmail({
    to: email,
    subject: `【希尔薇图集】${action}验证码 ${code}`,
    text: `你的${action}验证码是 ${code}，${ttlMinutes} 分钟内有效。如非本人操作请忽略此邮件。`,
    html: [
      '<div style="font-family:system-ui,-apple-system,sans-serif;color:#222;line-height:1.7">',
      `<p>你的${action}验证码是：</p>`,
      `<p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p>`,
      `<p>${ttlMinutes} 分钟内有效。如非本人操作请忽略此邮件。</p>`,
      '</div>',
    ].join(''),
  });
  return result.ok;
}

/** 关闭邮件连接池等底层资源（进程退出时调用）；未启用通道时为无操作。 */
export function closeNotifier(): void {
  notifier.close();
}
