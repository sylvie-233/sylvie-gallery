import { createNotifier } from '@sylvie/notify';

import { env } from '../config/env.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('notify');

/**
 * 应用级通知实例：
 * - 配置 SMTP_HOST 时启用邮件通道（开发环境为 Mailpit）；
 * - 短信通道暂未配置，接入服务商后在 `sms.send` 中注入实现即可。
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

/** 发送邮箱验证码；失败已被通道吞掉，这里只返回是否成功。 */
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

/** 关闭通知通道（进程退出时调用）。 */
export function closeNotifier(): void {
  notifier.close();
}
