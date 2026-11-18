import type { CheckinResult, CheckinStatus, UserProfile } from '@sylvie/types';

import { dbClient, queryOneOn } from '../db/index.js';
import type { AuthUser } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { effectiveRole, isVipActive } from '../utils/format.js';

interface UserRow {
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

const USER_COLUMNS = `id, email, nickname, avatar_type AS avatarType, avatar_index AS avatarIndex,
  avatar_url AS avatarUrl, role, points, vip_expire_at AS vipExpireAt,
  email_verified AS emailVerified, created_at AS createdAt`;

export async function countUnread(userId: number): Promise<number> {
  const row = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM user_notification WHERE user_id = ? AND is_read = 0`,
    [userId],
  );
  return Number(row?.total ?? 0);
}

export function mapProfile(row: UserRow, unreadCount: number): UserProfile {
  const role = effectiveRole(row.role, row.vipExpireAt);
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    avatarType: Number(row.avatarType),
    avatarIndex: Number(row.avatarIndex),
    avatarUrl: row.avatarUrl,
    role: row.role,
    effectiveRole: role,
    points: Number(row.points),
    vipExpireAt: row.vipExpireAt,
    emailVerified: row.emailVerified === 1,
    createdAt: row.createdAt,
    unreadCount,
    isVip: role === 'vip' && isVipActive(row.vipExpireAt),
  };
}

export async function getProfileById(userId: number): Promise<UserProfile> {
  const row = await dbClient.queryOne<UserRow>(
    `SELECT ${USER_COLUMNS} FROM \`user\` WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [userId],
  );
  if (!row) {
    throw new HttpError(404, '用户不存在');
  }
  return mapProfile(row, await countUnread(userId));
}

export function isVipUser(user: AuthUser | undefined): boolean {
  if (!user) {
    return false;
  }
  return effectiveRole(user.role, user.vipExpireAt) === 'vip' || user.role === 'admin';
}

export async function getCheckinStatus(userId: number): Promise<CheckinStatus> {
  const config = await dbClient.queryOne<{ value: string }>(
    `SELECT config_value AS value FROM sys_config WHERE config_key = 'checkin.points' LIMIT 1`,
  );
  const dailyPoints = Number(config?.value ?? 2);
  const row = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM user_checkin WHERE user_id = ? AND checkin_date = CURDATE()`,
    [userId],
  );
  return { checkedIn: Number(row?.total ?? 0) > 0, dailyPoints };
}

export async function checkin(userId: number): Promise<CheckinResult> {
  const status = await getCheckinStatus(userId);
  if (status.checkedIn) {
    return {
      checkin: false,
      points: 0,
      totalPoints: (await getPoints(userId)) ?? 0,
      message: '今天已经签到过了',
    };
  }

  const totalPoints = await dbClient.transaction(async (conn) => {
    await conn.query(
      `INSERT INTO user_checkin (user_id, points, checkin_date) VALUES (?, ?, CURDATE())`,
      [userId, status.dailyPoints],
    );
    await conn.query(`UPDATE \`user\` SET points = points + ? WHERE id = ?`, [
      status.dailyPoints,
      userId,
    ]);
    const row = await queryOneOn<{ points: number }>(
      conn,
      `SELECT points FROM \`user\` WHERE id = ? LIMIT 1`,
      [userId],
    );
    return Number(row?.points ?? 0);
  });

  return {
    checkin: true,
    points: status.dailyPoints,
    totalPoints,
    message: `签到成功，获得 ${status.dailyPoints} 积分`,
  };
}

async function getPoints(userId: number): Promise<number | null> {
  const row = await dbClient.queryOne<{ points: number }>(
    `SELECT points FROM \`user\` WHERE id = ? LIMIT 1`,
    [userId],
  );
  return row ? Number(row.points) : null;
}

export async function updateProfile(
  userId: number,
  input: { nickname?: string; avatarType?: number; avatarIndex?: number },
): Promise<UserProfile> {
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
    return getProfileById(userId);
  }

  params.push(userId);
  await dbClient.execute(`UPDATE \`user\` SET ${sets.join(', ')} WHERE id = ?`, params);
  return getProfileById(userId);
}

export async function setAvatarUrl(userId: number, avatarUrl: string): Promise<UserProfile> {
  await dbClient.execute(
    `UPDATE \`user\` SET avatar_type = 1, avatar_url = ? WHERE id = ?`,
    [avatarUrl, userId],
  );
  return getProfileById(userId);
}
