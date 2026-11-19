import type { SqlStatement } from '../shared.js';

/** 写入一条管理操作日志。 */
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
