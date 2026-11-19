import type { Role } from '@sylvie/types';

import type { SqlStatement } from './shared.js';

/** 登录校验行。 */
export interface LoginRow {
  id: number;
  email: string;
  passwordHash: string;
  role: Role;
  status: number;
  isDeleted: number;
}

/** 验证码校验行。 */
export interface VerifyCodeRow {
  id: number;
  code: string;
  expiredAt: string;
  usedAt: string | null;
}

/** 注册前检查邮箱是否已注册。 */
export function countRegisteredUserByEmail(email: string): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM \`user\` WHERE email = ? AND is_deleted = 0`,
    params: [email],
  };
}

/** 写入验证码，过期时间为当前时间加分钟数。 */
export function insertVerifyCode(
  email: string,
  scene: 'register' | 'reset_password',
  code: string,
  ttlMinutes: number,
): SqlStatement {
  return {
    sql: `INSERT INTO verify_code (email, scene, code, expired_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    params: [email, scene, code, ttlMinutes],
  };
}

/** 事务内加锁读取最近一条验证码。 */
export function selectLatestVerifyCodeForUpdate(
  email: string,
  scene: 'register' | 'reset_password',
): SqlStatement {
  return {
    sql: `SELECT id, code, expired_at AS expiredAt, used_at AS usedAt
       FROM verify_code
      WHERE email = ? AND scene = ?
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE`,
    params: [email, scene],
  };
}

/** 标记验证码已使用。 */
export function markVerifyCodeUsed(id: number): SqlStatement {
  return {
    sql: `UPDATE verify_code SET used_at = NOW() WHERE id = ?`,
    params: [id],
  };
}

/** 事务内加锁检查邮箱是否已注册。 */
export function countUserByEmailForUpdate(email: string): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM \`user\` WHERE email = ? FOR UPDATE`,
    params: [email],
  };
}

/** 注册新用户。 */
export function insertRegisteredUser(
  email: string,
  passwordHash: string,
  nickname: string,
): SqlStatement {
  return {
    sql: `INSERT INTO \`user\` (email, password_hash, nickname, role, points, email_verified)
       VALUES (?, ?, ?, 'member', 0, 1)`,
    params: [email, passwordHash, nickname],
  };
}

/** 注册成功欢迎通知。 */
export function insertWelcomeNotification(
  userId: number,
  title: string,
  content: string,
): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content) VALUES (?, 'system', ?, ?)`,
    params: [userId, title, content],
  };
}

/** 按邮箱查询登录用户。 */
export function selectLoginUser(email: string): SqlStatement {
  return {
    sql: `SELECT id, email, password_hash AS passwordHash, role, status, is_deleted AS isDeleted
       FROM \`user\`
      WHERE email = ?
      LIMIT 1`,
    params: [email],
  };
}
