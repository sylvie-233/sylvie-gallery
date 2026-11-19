/**
 * 后台用户的参数化 SQL：筛选列表、详情与加锁读取、积分 / 会员 / 密码 / 状态变更、
 * 以及对应的站内通知写入。
 *
 * 会改动用户数据的写入由 service 放在事务中执行；selectAdminUserForUpdate 使用 FOR UPDATE。
 */
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

/**
 * 构建用户列表 WHERE 片段。
 *
 * - 固定条件：is_deleted = 0；
 * - role 仅接受 admin / vip / member；
 * - status '1' 正常 / '0' 封禁；
 * - keyword 去空白后匹配昵称与邮箱。
 */
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

/** 统计当前筛选条件下的用户总数。 */
export function countAdminUsers(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM \`user\` WHERE ${where.sql}`,
    params: where.params,
  };
}

/** 统计全站未删除用户总数（不受列表筛选影响）。 */
export function countAllUsers(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM \`user\` WHERE is_deleted = 0`,
    params: [],
  };
}

/** 用户分页列表：按注册时间倒序、id 倒序；limit / offset 由调用方计算。 */
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

/** 读取未软删除的用户详情。 */
export function selectAdminUserById(userId: number): SqlStatement {
  return {
    sql: `SELECT ${USER_SELECT} FROM \`user\`
      WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [userId],
  };
}

/**
 * 事务内加锁读取用户（FOR UPDATE），用于积分调整、赠送会员、重置密码与封禁，
 * 防止并发写入互相覆盖。必须在事务中执行。
 */
export function selectAdminUserForUpdate(userId: number): SqlStatement {
  return {
    sql: `SELECT ${USER_SELECT} FROM \`user\`
      WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
    params: [userId],
  };
}

/**
 * 直接覆盖用户积分；非负约束由 service 用 Math.max(0, ...) 保证，
 * 这里不再做二次夹取。
 */
export function updateUserPoints(points: number, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET points = ? WHERE id = ?`,
    params: [points, userId],
  };
}

/** 写入积分调整站内通知（type = 'benefit'）。 */
export function insertPointsNotification(userId: number, content: string): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'benefit', '解锁积分调整', ?)`,
    params: [userId, content],
  };
}

/**
 * 赠送 30 天付费会员。
 *
 * GREATEST(COALESCE(vip_expire_at, NOW()), NOW()) 处理两种边界：
 * 无会员记录时从当前时间起算，尚未到期的会员从原到期日继续叠加；已过期则从当前时间重新起算。
 */
export function grantVipToUser(userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET role = 'vip',
         vip_expire_at = DATE_ADD(GREATEST(COALESCE(vip_expire_at, NOW()), NOW()), INTERVAL 30 DAY)
       WHERE id = ?`,
    params: [userId],
  };
}

/**
 * 写入后台赠送会员的权益凭证订单：
 * biz_type = 'vip'、pay_type = 'admin'、amount_cents = 0、vip_days = 30，直接置为已支付。
 * plan_id 取 code = 'monthly' 的套餐。
 */
export function insertVipGrantOrder(orderNo: string, userId: number): SqlStatement {
  return {
    sql: `INSERT INTO pay_order (order_no, user_id, biz_type, plan_id, pay_type, amount_cents,
         points_cost, vip_days, status, paid_at)
       VALUES (?, ?, 'vip', (SELECT id FROM membership_plan WHERE code = 'monthly' LIMIT 1),
         'admin', 0, 0, 30, 'paid', NOW())`,
    params: [orderNo, userId],
  };
}

/** 写入会员赠送站内通知（type = 'benefit'）。 */
export function insertVipGrantNotification(userId: number, content: string): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content)
       VALUES (?, 'benefit', '付费会员已赠送', ?)`,
    params: [userId, content],
  };
}

/** 覆盖用户密码哈希；明文不落库。 */
export function updateUserPasswordHash(passwordHash: string, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET password_hash = ? WHERE id = ?`,
    params: [passwordHash, userId],
  };
}

/** 设置用户状态：1 正常、0 封禁（封禁通过 status 生效，不物理删除）。 */
export function updateUserStatus(status: number, userId: number): SqlStatement {
  return {
    sql: `UPDATE \`user\` SET status = ? WHERE id = ?`,
    params: [status, userId],
  };
}

/** 写入封禁 / 解封站内通知（type = 'system'）。 */
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
