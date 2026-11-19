import type { CheckinResult, CheckinStatus, UserProfile } from '@sylvie/types';

import { dbClient, queryOneOn } from '../db/index.js';
import {
  addUserPoints,
  buildUpdateUserProfile,
  insertUserCheckin,
  selectCheckinPointsConfig,
  selectTodayCheckinCount,
  selectUnreadCount,
  selectUserById,
  selectUserPoints,
  setUserAvatarUrl,
  type PointsRow,
  type UserRow,
} from '../sql/user.sql.js';
import type { AuthUser } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { effectiveRole, isVipActive } from '../utils/format.js';

export async function countUnread(userId: number): Promise<number> {
  const statement = selectUnreadCount(userId);
  const row = await dbClient.queryOne<{ total: number }>(statement.sql, statement.params);
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
  const statement = selectUserById(userId);
  const row = await dbClient.queryOne<UserRow>(statement.sql, statement.params);
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
  const configStatement = selectCheckinPointsConfig();
  const config = await dbClient.queryOne<{ value: string }>(
    configStatement.sql,
    configStatement.params,
  );
  const dailyPoints = Number(config?.value ?? 2);
  const checkinStatement = selectTodayCheckinCount(userId);
  const row = await dbClient.queryOne<{ total: number }>(
    checkinStatement.sql,
    checkinStatement.params,
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
    const checkinStatement = insertUserCheckin(userId, status.dailyPoints);
    await conn.query(checkinStatement.sql, checkinStatement.params);

    const pointsStatement = addUserPoints(status.dailyPoints, userId);
    await conn.query(pointsStatement.sql, pointsStatement.params);

    const selectStatement = selectUserPoints(userId);
    const row = await queryOneOn<PointsRow>(
      conn,
      selectStatement.sql,
      selectStatement.params,
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
  const statement = selectUserPoints(userId);
  const row = await dbClient.queryOne<PointsRow>(statement.sql, statement.params);
  return row ? Number(row.points) : null;
}

export async function updateProfile(
  userId: number,
  input: { nickname?: string; avatarType?: number; avatarIndex?: number },
): Promise<UserProfile> {
  const statement = buildUpdateUserProfile(userId, input);
  if (!statement) {
    return getProfileById(userId);
  }

  await dbClient.execute(statement.sql, statement.params);
  return getProfileById(userId);
}

export async function setAvatarUrl(userId: number, avatarUrl: string): Promise<UserProfile> {
  const statement = setUserAvatarUrl(avatarUrl, userId);
  await dbClient.execute(statement.sql, statement.params);
  return getProfileById(userId);
}
