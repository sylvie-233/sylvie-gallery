import type { SqlStatement } from './shared.js';

/**
 * 前台用户 SQL：资料、签到积分与头像。
 * 积分只增（签到）或由解锁事务扣减，`user.points` 不得为负；
 * 资料读取一律过滤 `is_deleted = 0`，更新仅按主键进行。
 */

/** 用户资料行。 */
export interface UserRow {
  id: number;
  email: string;
  nickname: string;
  avatarType: number;
  avatarIndex: number;
  avatarUrl: string | null;
  role: 'member' | 'vip' | 'admin';
  points: number;
  vipExpireAt: string | null;
  emailVerified: number;
  createdAt: string;
}

/** 用户积分行：仅取 `points`，用于签到 / 解锁后回读。 */
export interface PointsRow {
  points: number;
}

const USER_COLUMNS = `id, email, nickname, avatar_type AS avatarType, avatar_index AS avatarIndex,
  avatar_url AS avatarUrl, role, points, vip_expire_at AS vipExpireAt,
  email_verified AS emailVerified, created_at AS createdAt`;

/** 未读通知数（个人资料角标）。 */
export function selectUnreadCount(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM user_notification WHERE user_id = ? AND is_read = 0`,
    params: [userId],
  };
}

/** 按主键查询未删除用户资料。 */
export function selectUserById(userId: number): SqlStatement {
  return {
    sql: `SELECT ${USER_COLUMNS} FROM \`user\` WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [userId],
  };
}

/** 签到积分配置（`sys_config.checkin.points`，缺失时由 service 兜底为 2）。 */
export function selectCheckinPointsConfig(): SqlStatement {
  return {
    sql: `SELECT config_value AS value FROM sys_config WHERE config_key = 'checkin.points' LIMIT 1`,
    params: [],
  };
}

/** 今日签到记录数（按 `checkin_date = CURDATE()` 判断，>0 表示已签到）。 */
export function selectTodayCheckinCount(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM user_checkin WHERE user_id = ? AND checkin_date = CURDATE()`,
    params: [userId],
  };
}

/** 写入当日签到记录，`points` 为本次获得的解锁积分。 */
export function insertUserCheckin(userId: number, points: number): SqlStatement {
  return {
    sql: `INSERT INTO user_checkin (user_id, points, checkin_date) VALUES (?, ?, CURDATE())`,
    params: [userId, points],
  };
}

/** 增加用户积分（签到）；调用方需保证传入正数，避免误扣。 */
export function addUserPoints(points: number, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET points = points + ? WHERE id = ?`,
    params: [points, userId],
  };
}

/** 回读用户当前积分（事务内用于返回最新余额）。 */
export function selectUserPoints(userId: number): SqlStatement {
  return {
    sql: `SELECT points FROM \`user\` WHERE id = ? LIMIT 1`,
    params: [userId],
  };
}

/**
 * 按需更新资料字段，只有显式传入的字段才会写入：
 * - `nickname` 直接更新；
 * - `avatarType` 为 0（预设头像）时才同时更新 `avatarIndex`；
 * - 无任何可更新字段时返回 null，调用方跳过 UPDATE。
 */
export function buildUpdateUserProfile(
  userId: number,
  input: { nickname?: string; avatarType?: number; avatarIndex?: number },
): SqlStatement | null {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.nickname !== undefined) {
    sets.push('nickname = ?');
    params.push(input.nickname);
  }
  if (input.avatarType !== undefined) {
    sets.push('avatar_type = ?');
    params.push(input.avatarType);
    if (input.avatarType === 0 && input.avatarIndex !== undefined) {
      sets.push('avatar_index = ?');
      params.push(input.avatarIndex);
    }
  }
  if (sets.length === 0) {
    return null;
  }

  params.push(userId);
  return {
    sql: `UPDATE \`user\` SET ${sets.join(', ')} WHERE id = ?`,
    params,
  };
}

/** 设置上传头像地址，同时将 `avatar_type` 切为 1（上传头像）。 */
export function setUserAvatarUrl(avatarUrl: string, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET avatar_type = 1, avatar_url = ? WHERE id = ?`,
    params: [avatarUrl, userId],
  };
}
