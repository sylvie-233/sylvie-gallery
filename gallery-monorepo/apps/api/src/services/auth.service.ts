/**
 * 前台认证业务：邮箱验证码、注册与登录。
 * 验证码在事务内加锁并一次性消费；注册成功后签发 JWT 并返回用户资料。
 */
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
import { sendVerifyCodeMail } from './notify.service.js';
import { getProfileById } from './user.service.js';

const CODE_TTL_MINUTES = 10;
const log = moduleLogger('auth');

/** 邮箱归一化：去首尾空白并转小写，保证验证码与登录查询一致。 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 发送邮箱验证码：开发环境返回固定演示码。
 * - 注册场景先检查邮箱未注册（已注册返回 409）；
 * - 验证码落库有效期 10 分钟，配置 SMTP_HOST 后真实发信（开发对接 Mailpit），
 *   未配置则只写日志；
 * - 发信失败不阻断流程，返回值仍表示验证码已生成；仅非生产环境回显演示码。
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

/**
 * 校验并消费验证码；演示码（非生产）可直接通过。
 * 事务内 `FOR UPDATE` 读取最新验证码，依次校验未使用、未过期与码值，
 * 通过后立即标记已使用，保证一次性消费且并发下不可重复使用。
 */
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

/**
 * 签发登录 JWT（`Bearer`）并加载用户资料。
 * JWT 仅携带用户 id，角色 / 会员状态由服务端按需重新判定，避免令牌内容过期失真。
 */
async function buildAuthResult(userId: number): Promise<AuthResult> {
  const { token, expiresIn } = await signToken(userId);
  const profile = await getProfileById(userId);
  return { token, tokenType: 'Bearer', expiresIn, profile };
}

/**
 * 注册：整个流程在同一事务内完成。
 * 加锁检查邮箱唯一性 → 一次性消费验证码 → 写入 member 用户 → 欢迎通知；
 * 任一步失败回滚，成功后签发 JWT 返回登录态。
 */
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

/**
 * 邮箱 + 密码登录。
 * 已软删除或密码错误统一返回 401（不泄露账号是否存在），封禁账号返回 403；
 * 校验通过后签发 JWT。
 */
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
