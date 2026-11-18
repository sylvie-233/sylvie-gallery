import {
  ADMIN_ACTION_LABELS,
  type AdminLogRow,
  type PageResult,
} from '@sylvie/types';

import { dbClient } from '../../db/index.js';
import { normalizePage, toPageResult } from '../../utils/format.js';

interface LogDbRow {
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

export async function getAdminLogs(query: {
  action?: string;
  keyword?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<AdminLogRow>> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 8);
  const conditions = ['1 = 1'];
  const params: unknown[] = [];

  if (query.action) {
    conditions.push('l.action = ?');
    params.push(query.action);
  }
  const keyword = query.keyword?.trim() ?? '';
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(l.action LIKE ? OR l.target_type LIKE ? OR l.detail LIKE ?)');
    params.push(like, like, like);
  }
  if (query.from) {
    conditions.push('DATE(l.created_at) >= ?');
    params.push(query.from);
  }
  if (query.to) {
    conditions.push('DATE(l.created_at) <= ?');
    params.push(query.to);
  }

  const where = conditions.join(' AND ');
  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM admin_op_log l WHERE ${where}`,
    params,
  );
  const rows = await dbClient.query<LogDbRow>(
    `SELECT l.id, l.admin_id AS adminId, u.nickname AS adminName, l.action,
            l.target_type AS targetType, l.target_id AS targetId, l.detail, l.ip,
            l.created_at AS createdAt
       FROM admin_op_log l
       JOIN \`user\` u ON u.id = l.admin_id
      WHERE ${where}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return toPageResult(
    rows.map((row) => ({
      id: Number(row.id),
      adminId: Number(row.adminId),
      adminName: row.adminName,
      action: row.action,
      actionLabel: ADMIN_ACTION_LABELS[row.action] ?? row.action,
      targetType: row.targetType,
      targetId: row.targetId === null ? null : Number(row.targetId),
      detail: row.detail,
      ip: row.ip,
      createdAt: row.createdAt,
    })),
    Number(countRow?.total ?? 0),
    page,
    pageSize,
  );
}
