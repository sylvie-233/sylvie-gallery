/**
 * 后台操作日志查询的参数化 SQL：筛选条件、总数与分页列表。
 *
 * 列表关联 user 取操作人昵称；仅读取，写入见 log.sql.ts。
 */
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

/** 操作日志筛选参数：动作、关键字与日期区间。 */
export interface LogFilter {
  action?: string;
  keyword?: string;
  from?: string;
  to?: string;
}

/**
 * 构建操作日志 WHERE 片段。
 *
 * - 以 `1 = 1` 占位便于追加条件；
 * - action 精确匹配；
 * - keyword 去空白后匹配动作、目标类型、详情；
 * - from / to 以 DATE(created_at) 做闭区间过滤。
 */
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

/** 统计当前筛选条件下的日志总数。 */
export function countAdminLogs(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM admin_op_log l WHERE ${where.sql}`,
    params: where.params,
  };
}

/**
 * 日志分页列表：关联 user 取操作人昵称，按时间倒序、id 倒序；
 * limit / offset 由调用方计算。
 */
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
