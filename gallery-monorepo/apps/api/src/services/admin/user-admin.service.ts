import { randomInt } from 'node:crypto';

import { hash } from 'bcryptjs';

import type {
  AdminResetPasswordResult,
  AdminUserPage,
  AdminUserRow,
  Role,
} from '@sylvie/types';

import { dbClient, queryOneOn, type TransactionConnection } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { createOrderNo, normalizePage, toPageResult } from '../../utils/format.js';
import { logAdminOp } from './log.service.js';

interface UserDbRow {
  id: number;
  nickname: string;
  email: string;
  role: Role;
  points: number;
  vipExpireAt: string | null;
  status: number;
  emailVerified: number;
  createdAt: string;
}

const USER_SELECT = `id, nickname, email, role, points, vip_expire_at AS vipExpireAt,
  status, email_verified AS emailVerified, created_at AS createdAt`;

function mapUser(row: UserDbRow): AdminUserRow {
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
  const conditions = ['is_deleted = 0'];
  const params: unknown[] = [];

  if (query.role === 'admin' || query.role === 'vip' || query.role === 'member') {
    conditions.push('role = ?');
    params.push(query.role);
  }
  if (query.status === '1') {
    conditions.push('status = 1');
  } else if (query.status === '0') {
    conditions.push('status = 0');
  }
  const keyword = query.keyword?.trim() ?? '';
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(nickname LIKE ? OR email LIKE ?)');
    params.push(like, like);
  }

  const where = conditions.join(' AND ');
  const [countRow, allRow, rows] = await Promise.all([
    dbClient.queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM \`user\` WHERE ${where}`,
      params,
    ),
    dbClient.queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM \`user\` WHERE is_deleted = 0`,
    ),
    dbClient.query<UserDbRow>(
      `SELECT ${USER_SELECT} FROM \`user\`
        WHERE ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ),
  ]);

  return {
    ...toPageResult(rows.map(mapUser), Number(countRow?.total ?? 0), page, pageSize),
    totalAll: Number(allRow?.total ?? 0),
  };
}

async function getAdminUser(userId: number): Promise<AdminUserRow> {
  const row = await dbClient.queryOne<UserDbRow>(
    `SELECT ${USER_SELECT} FROM \`user\`
      WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [userId],
  );
  if (!row) {
    throw new HttpError(404, '用户不存在');
  }
  return mapUser(row);
}

async function requireOperableUser(conn: TransactionConnection, userId: number): Promise<UserDbRow> {
  const row = await queryOneOn<UserDbRow>(
    conn,
    `SELECT ${USER_SELECT} FROM \`user\`
      WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
    [userId],
  );
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
    const user = await queryOneOn<UserDbRow>(
      conn,
      `SELECT ${USER_SELECT} FROM \`user\` WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
      [userId],
    );
    if (!user) {
      throw new HttpError(404, '用户不存在');
    }
    if (user.role === 'admin') {
      throw new HttpError(400, '管理员账号不提供该操作');
    }
    const before = Number(user.points);
    const after = Math.max(0, before + delta);
    await conn.query(`UPDATE \`user\` SET points = ? WHERE id = ?`, [after, userId]);
    await conn.query(
      `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'benefit', '解锁积分调整', ?)`,
      [userId, `管理员调整了你的解锁积分：${before} → ${after}（${reason}）。`],
    );
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
    await conn.query(
      `UPDATE \`user\` SET role = 'vip',
         vip_expire_at = DATE_ADD(GREATEST(COALESCE(vip_expire_at, NOW()), NOW()), INTERVAL 30 DAY)
       WHERE id = ?`,
      [userId],
    );
    const orderNo = createOrderNo();
    await conn.query(
      `INSERT INTO pay_order (order_no, user_id, biz_type, plan_id, pay_type, amount_cents,
         points_cost, vip_days, status, paid_at)
       VALUES (?, ?, 'vip', (SELECT id FROM membership_plan WHERE code = 'monthly' LIMIT 1),
         'admin', 0, 0, 30, 'paid', NOW())`,
      [orderNo, userId],
    );
    await conn.query(
      `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'benefit', '付费会员已赠送', ?)`,
      [userId, '管理员为你赠送了 30 天付费会员，权益已在剩余有效期上叠加。'],
    );
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
    await conn.query(`UPDATE \`user\` SET password_hash = ? WHERE id = ?`, [passwordHash, userId]);
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
    await conn.query(`UPDATE \`user\` SET status = ? WHERE id = ?`, [nextStatus, userId]);
    await conn.query(
      `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'system', ?, ?)`,
      [
        userId,
        nextStatus === 1 ? '账号已解封' : '账号已被封禁',
        nextStatus === 1 ? '你的账号已恢复正常使用。' : '你的账号因违规操作已被封禁，请联系管理员。',
      ],
    );
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
