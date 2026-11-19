/**
 * 管理操作日志写入工具：所有后台写操作都应调用 logAdminOp 留下审计记录。
 *
 * 日志采用「尽力而为」策略：写入失败只记录错误日志，绝不回滚或阻断主业务。
 */
import { dbClient } from '../../db/index.js';
import { moduleLogger } from '../../utils/logger.js';
import { insertAdminOpLog } from '../../sql/admin/log.sql.js';

const log = moduleLogger('admin-log');

/**
 * 写入一条管理操作日志。
 *
 * @param adminId 操作管理员 ID
 * @param action 动作标识，如 album.create / order.refund
 * @param targetType 目标资源类型（album / user / config 等），可为 null
 * @param targetId 目标主键，可为 null（如全局配置）
 * @param detail 详情，字符串直接写入，其他值序列化为 JSON，空值写 null
 * @param ip 操作来源 IP，可为空
 * 副作用：写 admin_op_log；异常被捕获并记录，不向调用方抛出。
 */
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
