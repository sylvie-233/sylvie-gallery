import {
  ADMIN_ACTION_LABELS,
  type AdminLogRow,
  type PageResult,
} from '@sylvie/types';

import { dbClient } from '../../db/index.js';
import { normalizePage, toPageResult } from '../../utils/format.js';
import {
  buildAdminLogWhere,
  countAdminLogs,
  selectAdminLogs,
  type LogRow,
} from '../../sql/admin/log-admin.sql.js';

export async function getAdminLogs(query: {
  action?: string;
  keyword?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<AdminLogRow>> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 8);
  const where = buildAdminLogWhere(query);
  const countStatement = countAdminLogs(where);
  const rowsStatement = selectAdminLogs(where, pageSize, offset);

  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const rows = await dbClient.query<LogRow>(rowsStatement.sql, rowsStatement.params);

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
