import type { SqlFragment, SqlStatement } from '../shared.js';

/** 管理操作日志行。 */
export interface LogRow {
  id: number;
  adminId: number;
  adminName: string;
  action: string;
  targetType: string | null;
  targetId: number | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

export interface LogFilter {
  action?: string;
  keyword?: string;
  from?: string;
  to?: string;
}

/** 操作日志筛选条件。 */
export function buildAdminLogWhere(filter: LogFilter): SqlFragment {
  const conditions = ['1 = 1'];
  const params: unknown[] = [];

  if (filter.action) {
    conditions.push('l.action = ?');
    params.push(filter.action);
  }
  const keyword = filter.keyword?.trim() ?? '';
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(l.action LIKE ? OR l.target_type LIKE ? OR l.detail LIKE ?)');
    params.push(like, like, like);
  }
  if (filter.from) {
    conditions.push('DATE(l.created_at) >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push('DATE(l.created_at) <= ?');
    params.push(filter.to);
  }

  return { sql: conditions.join(' AND '), params };
}

export function countAdminLogs(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM admin_op_log l WHERE ${where.sql}`,
    params: where.params,
  };
}

export function selectAdminLogs(
  where: SqlFragment,
  limit: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT l.id, l.admin_id AS adminId, u.nickname AS adminName, l.action,
            l.target_type AS targetType, l.target_id AS targetId, l.detail, l.ip,
            l.created_at AS createdAt
       FROM admin_op_log l
       JOIN \`user\` u ON u.id = l.admin_id
      WHERE ${where.sql}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ? OFFSET ?`,
    params: [...where.params, limit, offset],
  };
}
