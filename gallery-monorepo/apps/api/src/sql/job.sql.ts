import { placeholders, type SqlStatement } from './shared.js';

/** 会员到期扫描行。 */
export interface ExpiredVipRow {
  id: number;
  nickname: string;
}

/** 锁定所有已到期但仍标记为 vip 的用户。 */
export function selectExpiredVipUsers(): SqlStatement {
  return {
    sql: `SELECT id, nickname
            FROM \`user\`
           WHERE role = 'vip'
             AND vip_expire_at IS NOT NULL
             AND vip_expire_at <= NOW()
             AND is_deleted = 0
           FOR UPDATE`,
    params: [],
  };
}

/** 批量降级为注册会员；保留 vip_expire_at 作为历史记录。 */
export function downgradeVipUsers(ids: number[]): SqlStatement {
  return {
    sql: `UPDATE \`user\`
             SET role = 'member'
           WHERE role = 'vip' AND id IN (${placeholders(ids.length)})`,
    params: ids,
  };
}

/** 查询用户会员到期时间。 */
export function selectVipExpireAt(userId: number): SqlStatement {
  return {
    sql: `SELECT vip_expire_at AS vipExpireAt
            FROM \`user\`
           WHERE id = ? AND is_deleted = 0
           LIMIT 1`,
    params: [userId],
  };
}

/** 确认用户确实已到期（用于延时通知任务，避免续费后误发）。 */
export function selectVipExpiredForNotice(userId: number): SqlStatement {
  return {
    sql: `SELECT id
            FROM \`user\`
           WHERE id = ?
             AND is_deleted = 0
             AND role <> 'admin'
             AND vip_expire_at IS NOT NULL
             AND vip_expire_at <= NOW()
           LIMIT 1`,
    params: [userId],
  };
}

/** 写入会员到期权益通知。 */
export function insertVipExpiredNotification(userId: number): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content)
          VALUES (?, 'benefit', '付费会员已到期', '你的付费会员已到期，全站畅看与下载权益已停止；可在会员页续费后立即恢复。')`,
    params: [userId],
  };
}
