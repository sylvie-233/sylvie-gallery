import type { Role } from '@sylvie/types';

import type { SqlStatement } from './shared.js';

/**
 * 前台认证 SQL：邮箱验证码、注册与登录查询。
 * 验证码在事务内 `FOR UPDATE` 读取并标记已使用，保证一次性消费；
 * 注册时同样加锁检查邮箱唯一性，避免并发重复注册。
 */

/** 登录校验行。 */
export interface LoginRow {
  id: number;
  email: string;
  passwordHash: string;
  role: Role;
  status: number;
  isDeleted: number;
}

/** 验证码校验行：`usedAt` 非空表示已被消费，不可再次使用。 */
export interface VerifyCodeRow {
  id: number;
  code: string;
  expiredAt: string;
  usedAt: string | null;
}

/** 注册前检查邮箱是否已注册（只统计未软删除用户，非事务快速校验）。 */
export function countRegisteredUserByEmail(email: string): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM \`user\` WHERE email = ? AND is_deleted = 0`,
    params: [email],
  };
}

/**
 * 写入验证码，`expired_at = NOW() + ttlMinutes` 分钟。
 * `scene` 区分注册与找回密码，消费时按同一 scene 取最新一条。
 */
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

/**
 * 事务内 `FOR UPDATE` 读取同邮箱 / 场景下最新一条验证码。
 * 加行锁后由 service 校验有效期、是否已使用与码值，命中后立即标记已用，
 * 防止同一验证码被并发重复消费。
 */
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

/** 标记验证码已使用（一次性消费），须与校验处于同一事务。 */
export function markVerifyCodeUsed(id: number): SqlStatement {
  return {
    sql: `UPDATE verify_code SET used_at = NOW() WHERE id = ?`,
    params: [id],
  };
}

/** 事务内 `FOR UPDATE` 加锁检查邮箱是否已注册，配合唯一约束防止并发重复注册。 */
export function countUserByEmailForUpdate(email: string): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM \`user\` WHERE email = ? FOR UPDATE`,
    params: [email],
  };
}

/**
 * 注册新用户：固定 `role='member'`、初始积分 0、邮箱已验证（验证码已校验）。
 * 密码以 bcrypt 哈希传入，不保存明文。
 */
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

/** 注册成功欢迎通知（`type='system'`），引导用户签到获取解锁积分。 */
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

/**
 * 按邮箱查询登录用户（含密码哈希、角色、状态、软删除标记）。
 * 不在此处过滤删除 / 封禁，由 service 统一返回一致的登录失败提示。
 */
export function selectLoginUser(email: string): SqlStatement {
  return {
    sql: `SELECT id, email, password_hash AS passwordHash, role, status, is_deleted AS isDeleted
       FROM \`user\`
      WHERE email = ?
      LIMIT 1`,
    params: [email],
  };
}
