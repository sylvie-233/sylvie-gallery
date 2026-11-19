/**
 * 会员到期任务相关 SQL：扫描 / 锁定到期用户、批量降级、读取到期时间、
 * 通知前二次校验，以及写入站内到期通知。
 * 所有语句均返回 `{ sql, params }`，由服务层在事务或连接上参数化执行。
 */
import { placeholders, type SqlStatement } from './shared.js';

/** 会员到期扫描行：仅取降级所需的最小字段。 */
export interface ExpiredVipRow {
  id: number;
  nickname: string;
}

/**
 * 锁定所有已到期但仍标记为 vip 的用户（role='vip'、vip_expire_at 已过、未删除）。
 * `FOR UPDATE` 会在事务内锁定命中的行，必须在事务中执行并与批量降级同事务，
 * 避免与续费并发时重复降级。时间比较使用数据库 `NOW()`，要求库会话时区与业务一致。
 * @returns 参数化查询语句（无参数）。
 */
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

/**
 * 按 ID 批量将 `role` 从 vip 改为 member；保留 `vip_expire_at` 作为历史记录。
 * 条件中再次限定 role='vip'，避免覆盖扫描后被并发续费的用户。
 * @param ids 待降级的用户 ID（调用方需保证非空，`IN (...)` 占位符按长度生成）。
 */
export function downgradeVipUsers(ids: number[]): SqlStatement {
  return {
    sql: `UPDATE \`user\`
             SET role = 'member'
           WHERE role = 'vip' AND id IN (${placeholders(ids.length)})`,
    params: ids,
  };
}

/**
 * 查询用户会员到期时间（北京时间 DATETIME 字符串）。
 * 已删除用户返回空结果。
 * @param userId 用户 ID。
 */
export function selectVipExpireAt(userId: number): SqlStatement {
  return {
    sql: `SELECT vip_expire_at AS vipExpireAt
            FROM \`user\`
           WHERE id = ? AND is_deleted = 0
           LIMIT 1`,
    params: [userId],
  };
}

/**
 * 确认用户确实已到期（用于延时通知任务，避免续费后误发）。
 * 排除已删除用户与管理员；有结果表示应发送到期通知。
 * @param userId 用户 ID。
 */
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

/**
 * 写入一条 `type='benefit'` 的会员到期站内通知。
 * 副作用：向 `user_notification` 插入记录；重复调用会写入多条，
 * 因此服务层先用到期校验拦截，并以每用户唯一的延时任务 ID 保证只触发一次。
 * @param userId 用户 ID。
 */
export function insertVipExpiredNotification(userId: number): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content)
          VALUES (?, 'benefit', '付费会员已到期', '你的付费会员已到期，全站畅看与下载权益已停止；可在会员页续费后立即恢复。')`,
    params: [userId],
  };
}
