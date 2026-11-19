/** 管理操作日志写入 SQL：向 admin_op_log 追加一条审计记录。 */
import type { SqlStatement } from '../shared.js';

/**
 * 写入一条管理操作日志。
 *
 * detail 由 service 序列化为字符串或 null；targetType / targetId 可为空（如全局配置）。
 */
export function insertAdminOpLog(
  adminId: number,
  action: string,
  targetType: string | null,
  targetId: number | null,
  detail: string | null,
  ip: string | null,
): SqlStatement {
  return {
    sql: `INSERT INTO admin_op_log (admin_id, action, target_type, target_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
    params: [adminId, action, targetType, targetId, detail, ip],
  };
}
