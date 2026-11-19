import { randomInt } from 'node:crypto';

import { compare, hash } from 'bcryptjs';

import type { AuthResult } from '@sylvie/types';

import { env } from '../config/env.js';
import { dbClient, queryOneOn } from '../db/index.js';
import type { TransactionConnection } from '../db/index.js';
import {
  countRegisteredUserByEmail,
  countUserByEmailForUpdate,
  insertRegisteredUser,
  insertVerifyCode,
  insertWelcomeNotification,
  markVerifyCodeUsed,
  selectLatestVerifyCodeForUpdate,
  selectLoginUser,
  type LoginRow,
  type VerifyCodeRow,
} from '../sql/auth.sql.js';
import { HttpError } from '../utils/http.js';
import { signToken } from '../utils/jwt.js';
import { moduleLogger } from '../utils/logger.js';
import { sendVerifyCodeMail } from './mailer.service.js';
import { getProfileById } from './user.service.js';

const CODE_TTL_MINUTES = 10;
const log = moduleLogger('auth');

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 发送邮箱验证码：开发环境返回固定演示码。
 * 配置 SMTP_HOST 后会真实发信（开发环境对接 Mailpit），未配置则只写日志。
 */
export async function sendVerifyCode(
  emailInput: string,
  scene: 'register' | 'reset_password',
): Promise<{ sent: boolean; expiresIn: number; demoCode?: string }> {
  const email = normalizeEmail(emailInput);

  if (scene === 'register') {
    const existsStatement = countRegisteredUserByEmail(email);
    const exists = await dbClient.queryOne<{ total: number }>(
      existsStatement.sql,
      existsStatement.params,
    );
    if (Number(exists?.total ?? 0) > 0) {
      throw new HttpError(409, '该邮箱已注册，请直接登录');
    }
  }

  const code = env.VERIFY_CODE_DEMO || String(randomInt(100000, 1000000));
  const codeStatement = insertVerifyCode(email, scene, code, CODE_TTL_MINUTES);
  await dbClient.execute(codeStatement.sql, codeStatement.params);

  log.info('验证码已生成', { email, scene, code, ttlMinutes: CODE_TTL_MINUTES });

  // 发信失败不阻断流程，验证码已落库；返回值仍表示验证码已生成。
  await sendVerifyCodeMail(email, code, scene, CODE_TTL_MINUTES);

  const result: { sent: boolean; expiresIn: number; demoCode?: string } = {
    sent: true,
    expiresIn: CODE_TTL_MINUTES * 60,
  };
  if (env.VERIFY_CODE_DEMO && env.NODE_ENV !== 'production') {
    result.demoCode = env.VERIFY_CODE_DEMO;
  }
  return result;
}

/** 校验并消费验证码；演示码可直接通过。 */
async function consumeVerifyCode(
  conn: TransactionConnection,
  email: string,
  scene: 'register' | 'reset_password',
  code: string,
): Promise<boolean> {
  if (env.VERIFY_CODE_DEMO && code === env.VERIFY_CODE_DEMO) {
    return true;
  }

  const statement = selectLatestVerifyCodeForUpdate(email, scene);
  const row = await queryOneOn<VerifyCodeRow>(
    conn,
    statement.sql,
    statement.params,
  );

  if (!row || row.usedAt) {
    return false;
  }
  if (new Date(row.expiredAt.replace(' ', 'T')).getTime() <= Date.now()) {
    return false;
  }
  if (row.code !== code) {
    return false;
  }

  const usedStatement = markVerifyCodeUsed(row.id);
  await conn.query(usedStatement.sql, usedStatement.params);
  return true;
}

async function buildAuthResult(userId: number): Promise<AuthResult> {
  const { token, expiresIn } = await signToken(userId);
  const profile = await getProfileById(userId);
  return { token, tokenType: 'Bearer', expiresIn, profile };
}

export async function register(input: {
  nickname: string;
  email: string;
  password: string;
  code: string;
}): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hash(input.password, 10);

  const userId = await dbClient.transaction(async (conn) => {
    const existsStatement = countUserByEmailForUpdate(email);
    const exists = await queryOneOn<{ total: number }>(
      conn,
      existsStatement.sql,
      existsStatement.params,
    );
    if (Number(exists?.total ?? 0) > 0) {
      throw new HttpError(409, '该邮箱已注册，请直接登录');
    }

    const codeValid = await consumeVerifyCode(conn, email, 'register', input.code);
    if (!codeValid) {
      throw new HttpError(400, '验证码无效或已过期，请重新获取');
    }

    const insertStatement = insertRegisteredUser(email, passwordHash, input.nickname.trim());
    const [result] = await conn.query(insertStatement.sql, insertStatement.params);
    const insertedId = (result as { insertId: number }).insertId;

    const notificationStatement = insertWelcomeNotification(
      insertedId,
      '欢迎来到希尔薇图集',
      '注册成功！每日签到可领取解锁积分，积分解锁后即可查看完整图集。',
    );
    await conn.query(notificationStatement.sql, notificationStatement.params);

    return insertedId;
  });

  return buildAuthResult(userId);
}

export async function login(emailInput: string, password: string): Promise<AuthResult> {
  const email = normalizeEmail(emailInput);
  const statement = selectLoginUser(email);
  const row = await dbClient.queryOne<LoginRow>(statement.sql, statement.params);

  if (!row || row.isDeleted === 1) {
    throw new HttpError(401, '邮箱或密码错误');
  }
  if (row.status !== 1) {
    throw new HttpError(403, '账号已被封禁，请联系管理员');
  }

  const valid = await compare(password, row.passwordHash);
  if (!valid) {
    throw new HttpError(401, '邮箱或密码错误');
  }

  return buildAuthResult(row.id);
}
