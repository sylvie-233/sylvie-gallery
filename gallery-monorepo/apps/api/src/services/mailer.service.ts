import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../config/env.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('mailer');

/** 未配置 SMTP_HOST 时关闭发信（本地无邮件服务也能正常启动）。 */
export const mailerEnabled = Boolean(env.SMTP_HOST);

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === 'true',
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 5000,
      socketTimeout: 5000,
    });
  }
  return transporter;
}

/**
 * 发送邮件。
 * 发送失败只记录日志，不向上抛出：邮件不可用不应阻断注册 / 登录主流程。
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  if (!mailerEnabled) {
    log.debug('SMTP 未配置，跳过发信', { to: message.to, subject: message.subject });
    return false;
  }

  try {
    await getTransporter().sendMail({ from: env.SMTP_FROM, ...message });
    log.info('邮件已发送', { to: message.to, subject: message.subject });
    return true;
  } catch (error) {
    log.error('邮件发送失败', error, { to: message.to, subject: message.subject });
    return false;
  }
}

/** 发送邮箱验证码。 */
export function sendVerifyCodeMail(
  email: string,
  code: string,
  scene: 'register' | 'reset_password',
  ttlMinutes: number,
): Promise<boolean> {
  const action = scene === 'register' ? '注册账号' : '重置密码';
  return sendMail({
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
}

/** 关闭发信连接（进程退出时调用）。 */
export function closeMailer(): void {
  transporter?.close();
  transporter = null;
}
