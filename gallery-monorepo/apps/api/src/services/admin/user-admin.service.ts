import { randomInt } from 'node:crypto';

import { hash } from 'bcryptjs';

import type {
  AdminResetPasswordResult,
  AdminUserPage,
  AdminUserRow,
} from '@sylvie/types';

import { dbClient, queryOneOn, type TransactionConnection } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { createOrderNo, normalizePage, toPageResult } from '../../utils/format.js';
import {
  buildUserWhere,
  countAdminUsers,
  countAllUsers,
  grantVipToUser,
  insertPointsNotification,
  insertStatusNotification,
  insertVipGrantNotification,
  insertVipGrantOrder,
  selectAdminUserById,
  selectAdminUserForUpdate,
  selectAdminUsers,
  updateUserPasswordHash,
  updateUserPoints,
  updateUserStatus,
  type UserRow,
} from '../../sql/admin/user-admin.sql.js';
import { logAdminOp } from './log.service.js';

function mapUser(row: UserRow): AdminUserRow {
  return {
    id: Number(row.id),
    nickname: row.nickname,
    email: row.email,
    role: row.role,
    points: Number(row.points),
    vipExpireAt: row.vipExpireAt,
    status: Number(row.status),
    emailVerified: row.emailVerified === 1,
    createdAt: row.createdAt,
  };
}

export async function getAdminUsers(query: {
  role?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminUserPage> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 8);
  const where = buildUserWhere(query);
  const countStatement = countAdminUsers(where);
  const allStatement = countAllUsers();
  const rowsStatement = selectAdminUsers(where, pageSize, offset);

  const [countRow, allRow, rows] = await Promise.all([
    dbClient.queryOne<{ total: number }>(countStatement.sql, countStatement.params),
    dbClient.queryOne<{ total: number }>(allStatement.sql, allStatement.params),
    dbClient.query<UserRow>(rowsStatement.sql, rowsStatement.params),
  ]);

  return {
    ...toPageResult(rows.map(mapUser), Number(countRow?.total ?? 0), page, pageSize),
    totalAll: Number(allRow?.total ?? 0),
  };
}

async function getAdminUser(userId: number): Promise<AdminUserRow> {
  const statement = selectAdminUserById(userId);
  const row = await dbClient.queryOne<UserRow>(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '用户不存在');
  }
  return mapUser(row);
}

async function requireOperableUser(conn: TransactionConnection, userId: number): Promise<UserRow> {
  const statement = selectAdminUserForUpdate(userId);
  const row = await queryOneOn<UserRow>(conn, statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '用户不存在');
  }
  if (row.role === 'admin') {
    throw new HttpError(400, '管理员账号不提供该操作');
  }
  return row;
}

export async function adjustAdminUserPoints(
  adminId: number,
  userId: number,
  input: { delta: number; reason: string },
  ip?: string | null,
): Promise<AdminUserRow> {
  const delta = Math.trunc(input.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new HttpError(400, '请输入非 0 的积分变动值');
  }
  const reason = input.reason.trim();
  if (!reason) {
    throw new HttpError(400, '请填写调整原因');
  }

  await dbClient.transaction(async (conn) => {
    const userStatement = selectAdminUserForUpdate(userId);
    const user = await queryOneOn<UserRow>(conn, userStatement.sql, userStatement.params);
    if (!user) {
      throw new HttpError(404, '用户不存在');
    }
    if (user.role === 'admin') {
      throw new HttpError(400, '管理员账号不提供该操作');
    }
    const before = Number(user.points);
    const after = Math.max(0, before + delta);
    const pointsStatement = updateUserPoints(after, userId);
    await conn.query(pointsStatement.sql, pointsStatement.params);
    const notificationStatement = insertPointsNotification(
      userId,
      `管理员调整了你的解锁积分：${before} → ${after}（${reason}）。`,
    );
    await conn.query(notificationStatement.sql, notificationStatement.params);
    await logAdminOp(
      adminId,
      'user.points',
      'user',
      userId,
      { before, after, delta, reason },
      ip,
    );
  });

  return getAdminUser(userId);
}

export async function grantAdminUserVip(
  adminId: number,
  userId: number,
  ip?: string | null,
): Promise<AdminUserRow> {
  await dbClient.transaction(async (conn) => {
    const user = await requireOperableUser(conn, userId);
    const grantStatement = grantVipToUser(userId);
    await conn.query(grantStatement.sql, grantStatement.params);
    const orderNo = createOrderNo();
    const orderStatement = insertVipGrantOrder(orderNo, userId);
    await conn.query(orderStatement.sql, orderStatement.params);
    const notificationStatement = insertVipGrantNotification(
      userId,
      '管理员为你赠送了 30 天付费会员，权益已在剩余有效期上叠加。',
    );
    await conn.query(notificationStatement.sql, notificationStatement.params);
    await logAdminOp(
      adminId,
      'user.grantvip',
      'user',
      userId,
      { nickname: user.nickname, days: 30, orderNo },
      ip,
    );
  });

  return getAdminUser(userId);
}

const TEMP_PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function resetAdminUserPassword(
  adminId: number,
  userId: number,
  ip?: string | null,
): Promise<AdminResetPasswordResult> {
  let password = 'Sy';
  for (let index = 0; index < 8; index += 1) {
    password += TEMP_PASSWORD_CHARS[randomInt(0, TEMP_PASSWORD_CHARS.length)];
  }
  const passwordHash = await hash(password, 10);

  await dbClient.transaction(async (conn) => {
    const user = await requireOperableUser(conn, userId);
    const passwordStatement = updateUserPasswordHash(passwordHash, userId);
    await conn.query(passwordStatement.sql, passwordStatement.params);
    await logAdminOp(
      adminId,
      'user.resetpwd',
      'user',
      userId,
      { nickname: user.nickname, email: user.email },
      ip,
    );
  });

  return { password, user: await getAdminUser(userId) };
}

export async function toggleAdminUserStatus(
  adminId: number,
  userId: number,
  ip?: string | null,
): Promise<AdminUserRow> {
  let nextStatus = 1;
  await dbClient.transaction(async (conn) => {
    const user = await requireOperableUser(conn, userId);
    nextStatus = Number(user.status) === 1 ? 0 : 1;
    const statusStatement = updateUserStatus(nextStatus, userId);
    await conn.query(statusStatement.sql, statusStatement.params);
    const notificationStatement = insertStatusNotification(
      userId,
      nextStatus === 1 ? '账号已解封' : '账号已被封禁',
      nextStatus === 1 ? '你的账号已恢复正常使用。' : '你的账号因违规操作已被封禁，请联系管理员。',
    );
    await conn.query(notificationStatement.sql, notificationStatement.params);
    await logAdminOp(
      adminId,
      nextStatus === 1 ? 'user.unban' : 'user.ban',
      'user',
      userId,
      { nickname: user.nickname, status: nextStatus },
      ip,
    );
  });

  return getAdminUser(userId);
}
