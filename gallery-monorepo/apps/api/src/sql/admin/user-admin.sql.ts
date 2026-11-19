import type { Role } from '@sylvie/types';

import type { SqlFragment, SqlStatement } from '../shared.js';

/** 管理后台用户列表行。 */
export interface UserRow {
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

export interface UserFilter {
  role?: string;
  status?: string;
  keyword?: string;
}

const USER_SELECT = `id, nickname, email, role, points, vip_expire_at AS vipExpireAt,
  status, email_verified AS emailVerified, created_at AS createdAt`;

/** 用户列表筛选条件。 */
export function buildUserWhere(filter: UserFilter): SqlFragment {
  const conditions = ['is_deleted = 0'];
  const params: unknown[] = [];

  if (filter.role === 'admin' || filter.role === 'vip' || filter.role === 'member') {
    conditions.push('role = ?');
    params.push(filter.role);
  }
  if (filter.status === '1') {
    conditions.push('status = 1');
  } else if (filter.status === '0') {
    conditions.push('status = 0');
  }
  const keyword = filter.keyword?.trim() ?? '';
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(nickname LIKE ? OR email LIKE ?)');
    params.push(like, like);
  }

  return { sql: conditions.join(' AND '), params };
}

export function countAdminUsers(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM \`user\` WHERE ${where.sql}`,
    params: where.params,
  };
}

export function countAllUsers(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM \`user\` WHERE is_deleted = 0`,
    params: [],
  };
}

export function selectAdminUsers(
  where: SqlFragment,
  limit: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT ${USER_SELECT} FROM \`user\`
        WHERE ${where.sql}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?`,
    params: [...where.params, limit, offset],
  };
}

export function selectAdminUserById(userId: number): SqlStatement {
  return {
    sql: `SELECT ${USER_SELECT} FROM \`user\`
      WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [userId],
  };
}

export function selectAdminUserForUpdate(userId: number): SqlStatement {
  return {
    sql: `SELECT ${USER_SELECT} FROM \`user\`
      WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
    params: [userId],
  };
}

export function updateUserPoints(points: number, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET points = ? WHERE id = ?`,
    params: [points, userId],
  };
}

export function insertPointsNotification(userId: number, content: string): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'benefit', '解锁积分调整', ?)`,
    params: [userId, content],
  };
}

export function grantVipToUser(userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET role = 'vip',
         vip_expire_at = DATE_ADD(GREATEST(COALESCE(vip_expire_at, NOW()), NOW()), INTERVAL 30 DAY)
       WHERE id = ?`,
    params: [userId],
  };
}

export function insertVipGrantOrder(orderNo: string, userId: number): SqlStatement {
  return {
    sql: `INSERT INTO pay_order (order_no, user_id, biz_type, plan_id, pay_type, amount_cents,
         points_cost, vip_days, status, paid_at)
       VALUES (?, ?, 'vip', (SELECT id FROM membership_plan WHERE code = 'monthly' LIMIT 1),
         'admin', 0, 0, 30, 'paid', NOW())`,
    params: [orderNo, userId],
  };
}

export function insertVipGrantNotification(userId: number, content: string): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'benefit', '付费会员已赠送', ?)`,
    params: [userId, content],
  };
}

export function updateUserPasswordHash(passwordHash: string, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET password_hash = ? WHERE id = ?`,
    params: [passwordHash, userId],
  };
}

export function updateUserStatus(status: number, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET status = ? WHERE id = ?`,
    params: [status, userId],
  };
}

export function insertStatusNotification(
  userId: number,
  title: string,
  content: string,
): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'system', ?, ?)`,
    params: [userId, title, content],
  };
}
