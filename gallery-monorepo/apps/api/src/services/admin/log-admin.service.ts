/**
 * 后台操作日志查询：分页读取 admin_op_log，并补充动作中文名与操作人昵称。
 *
 * 仅提供读取，写入统一走 log.service.ts 的 logAdminOp。
 */
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

/**
 * 分页查询管理操作日志。
 *
 * @param query.action 精确匹配动作标识（如 album.publish）
 * @param query.keyword 模糊匹配动作、目标类型、详情
 * @param query.from / query.to 按操作日期区间过滤
 * @param query.page / query.pageSize 未传默认每页 8 条
 * 关联 user 表取操作人昵称，按时间倒序；动作展示名取 ADMIN_ACTION_LABELS，缺失时回退原值。
 */
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
