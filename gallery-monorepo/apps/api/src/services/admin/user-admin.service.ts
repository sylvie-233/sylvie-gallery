/**
 * 后台用户管理：分页列表、积分调整、赠送会员、重置密码与封禁 / 解封。
 *
 * 所有写操作都在事务内先 FOR UPDATE 锁定用户，管理员账号不参与这些操作；
 * 每项操作同时写入站内通知与 admin_op_log。
 */
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

/** 将用户行映射为后台 DTO，把 email_verified 转为布尔值。 */
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

/**
 * 分页查询用户列表。
 *
 * @param query.role admin / vip / member
 * @param query.status '1' 正常 / '0' 封禁
 * @param query.keyword 模糊匹配昵称、邮箱
 * @param query.page / query.pageSize 未传默认每页 8 条
 * 同时返回筛选结果总数与全站未删除用户总数（totalAll）。
 */
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

/** 读取用户详情；不存在或已软删除时抛 404。 */
async function getAdminUser(userId: number): Promise<AdminUserRow> {
  const statement = selectAdminUserById(userId);
  const row = await dbClient.queryOne<UserRow>(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '用户不存在');
  }
  return mapUser(row);
}

/**
 * 在事务内 FOR UPDATE 读取可操作用户（加锁防止并发修改积分 / 状态）。
 * 用户不存在抛 404；目标是管理员账号时抛 400，禁止后台改写其他管理员。
 */
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

/**
 * 调整用户解锁积分。
 *
 * delta 必须为非 0 整数，原因必填。事务内 FOR UPDATE 读取当前积分，
 * 结果用 Math.max(0, before + delta) 保证积分不得为负（扣成负数时按 0 处理）。
 * 更新积分、写入站内通知并在事务内记录 user.points 日志（before / after / delta / reason）。
 */
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

/**
 * 后台赠送 30 天付费会员。
 *
 * 事务内 FOR UPDATE 锁定用户后，在剩余有效期上叠加 30 天（无有效期则从现在起算），
 * 并写入一条 pay_type = 'admin'、金额 0 的已支付会员订单作为权益凭证。
 * 同时写入站内通知并记录 user.grantvip 日志。重复赠送会持续叠加。
 */
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

/**
 * 重置用户密码为随机临时密码，明文仅在本次响应中返回一次。
 *
 * 临时密码为 `Sy` + 8 位去易混字符（排除 0/O/1/l/I 等），bcrypt(10) 后落库；
 * 事务内锁定用户并记录 user.resetpwd 日志。旧密码立即失效。
 */
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

/**
 * 封禁 / 解封用户（status 0 ↔ 1）。
 *
 * 事务内 FOR UPDATE 读取当前状态后取反，更新状态并写入站内通知；
 * 日志按结果记为 user.ban / user.unban。封禁通过 status 生效，不做物理删除。
 */
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
