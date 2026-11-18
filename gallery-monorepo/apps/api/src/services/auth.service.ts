import { randomInt } from 'node:crypto';

import { compare, hash } from 'bcryptjs';

import type { AuthResult, Role } from '@sylvie/types';

import { env } from '../config/env.js';
import { dbClient, queryOneOn } from '../db/index.js';
import type { TransactionConnection } from '../db/index.js';
import { HttpError } from '../utils/http.js';
import { signToken } from '../utils/jwt.js';
import { getProfileById } from './user.service.js';

const CODE_TTL_MINUTES = 10;

interface LoginRow {
  id: number;
  email: string;
  passwordHash: string;
  role: Role;
  status: number;
  isDeleted: number;
}

interface VerifyCodeRow {
  id: number;
  code: string;
  expiredAt: string;
  usedAt: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 发送邮箱验证码：开发环境返回固定演示码，生产环境仅写日志（接入 SMTP 后替换）。 */
export async function sendVerifyCode(
  emailInput: string,
  scene: 'register' | 'reset_password',
): Promise<{ sent: boolean; expiresIn: number; demoCode?: string }> {
  const email = normalizeEmail(emailInput);

  if (scene === 'register') {
    const exists = await dbClient.queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM \`user\` WHERE email = ? AND is_deleted = 0`,
      [email],
    );
    if (Number(exists?.total ?? 0) > 0) {
      throw new HttpError(409, '该邮箱已注册，请直接登录');
    }
  }

  const code = env.VERIFY_CODE_DEMO || String(randomInt(100000, 1000000));
  await dbClient.execute(
    `INSERT INTO verify_code (email, scene, code, expired_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [email, scene, code, CODE_TTL_MINUTES],
  );

  console.log(`[api:verify-code] ${email} (${scene}) 验证码：${code}，${CODE_TTL_MINUTES} 分钟内有效`);

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

  const row = await queryOneOn<VerifyCodeRow>(
    conn,
    `SELECT id, code, expired_at AS expiredAt, used_at AS usedAt
       FROM verify_code
      WHERE email = ? AND scene = ?
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE`,
    [email, scene],
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

  await conn.query(`UPDATE verify_code SET used_at = NOW() WHERE id = ?`, [row.id]);
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
    const exists = await queryOneOn<{ total: number }>(
      conn,
      `SELECT COUNT(*) AS total FROM \`user\` WHERE email = ? FOR UPDATE`,
      [email],
    );
    if (Number(exists?.total ?? 0) > 0) {
      throw new HttpError(409, '该邮箱已注册，请直接登录');
    }

    const codeValid = await consumeVerifyCode(conn, email, 'register', input.code);
    if (!codeValid) {
      throw new HttpError(400, '验证码无效或已过期，请重新获取');
    }

    const [result] = await conn.query(
      `INSERT INTO \`user\` (email, password_hash, nickname, role, points, email_verified)
       VALUES (?, ?, ?, 'member', 0, 1)`,
      [email, passwordHash, input.nickname.trim()],
    );
    const insertedId = (result as { insertId: number }).insertId;

    await conn.query(
      `INSERT INTO user_notification (user_id, type, title, content) VALUES (?, 'system', ?, ?)`,
      [
        insertedId,
        '欢迎来到希尔薇图集',
        '注册成功！每日签到可领取解锁积分，积分解锁后即可查看完整图集。',
      ],
    );

    return insertedId;
  });

  return buildAuthResult(userId);
}

export async function login(emailInput: string, password: string): Promise<AuthResult> {
  const email = normalizeEmail(emailInput);
  const row = await dbClient.queryOne<LoginRow>(
    `SELECT id, email, password_hash AS passwordHash, role, status, is_deleted AS isDeleted
       FROM \`user\`
      WHERE email = ?
      LIMIT 1`,
    [email],
  );

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
