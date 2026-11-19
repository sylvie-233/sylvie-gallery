/**
 * 前台用户业务：资料读取 / 更新、会员有效角色判定与每日签到积分。
 * 付费会员按 `role + vip_expire_at` 计算有效角色；签到积分只增不减，
 * 积分解锁扣分在订单事务内校验，保证余额不为负。
 */
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

/** 当前用户未读通知数。 */
export async function countUnread(userId: number): Promise<number> {
  const statement = selectUnreadCount(userId);
  const row = await dbClient.queryOne<{ total: number }>(statement.sql, statement.params);
  return Number(row?.total ?? 0);
}

/**
 * 映射用户资料。
 * `effectiveRole` 会结合 `vip_expire_at` 把已过期会员降级为 member；
 * `isVip` 仅在有效付费会员时为 true（管理员另有权限，不在该字段体现）。
 */
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

/** 按 id 读取未软删除用户资料（含未读数），不存在返回 404。 */
export async function getProfileById(userId: number): Promise<UserProfile> {
  const statement = selectUserById(userId);
  const row = await dbClient.queryOne<UserRow>(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '用户不存在');
  }
  return mapProfile(row, await countUnread(userId));
}

/**
 * 是否为有效付费会员（或管理员）：管理员视为全站可看可下载，
 * 普通用户需 `role='vip'` 且在有效期内。
 */
export function isVipUser(user: AuthUser | undefined): boolean {
  if (!user) {
    return false;
  }
  return effectiveRole(user.role, user.vipExpireAt) === 'vip' || user.role === 'admin';
}

/**
 * 查询签到状态：今日是否已签到，以及每日可获得的解锁积分。
 * 积分配置缺失时兜底为 2 分。
 */
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

/**
 * 每日签到：当天已签到则直接返回；否则在同一事务内写入签到记录并增加积分，
 * 保证「签到记录 + 积分」原子生效。积分只增不减。
 */
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

/** 读取用户当前积分；用户不存在返回 null。 */
async function getPoints(userId: number): Promise<number | null> {
  const statement = selectUserPoints(userId);
  const row = await dbClient.queryOne<PointsRow>(statement.sql, statement.params);
  return row ? Number(row.points) : null;
}

/**
 * 更新资料：仅更新显式传入的字段；没有可更新字段时直接返回当前资料。
 * 更新后重新读取完整资料，保证返回最新冗余 / 计算字段。
 */
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

/** 设置上传头像地址（头像类型切换为上传），返回最新资料。 */
export async function setAvatarUrl(userId: number, avatarUrl: string): Promise<UserProfile> {
  const statement = setUserAvatarUrl(avatarUrl, userId);
  await dbClient.execute(statement.sql, statement.params);
  return getProfileById(userId);
}
