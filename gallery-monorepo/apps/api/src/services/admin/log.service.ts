import { dbClient } from '../../db/index.js';
import { moduleLogger } from '../../utils/logger.js';
import { insertAdminOpLog } from '../../sql/admin/log.sql.js';

const log = moduleLogger('admin-log');

/** 写入管理操作日志；日志失败不阻断主业务。 */
export async function logAdminOp(
  adminId: number,
  action: string,
  targetType: string | null,
  targetId: number | null,
  detail: unknown,
  ip?: string | null,
): Promise<void> {
  try {
    const detailText =
      detail === null || detail === undefined
        ? null
        : typeof detail === 'string'
          ? detail
          : JSON.stringify(detail);
    const statement = insertAdminOpLog(
      adminId,
      action,
      targetType,
      targetId,
      detailText,
      ip ?? null,
    );
    await dbClient.execute(statement.sql, statement.params);
  } catch (error) {
    log.error('操作日志写入失败', error);
  }
}
