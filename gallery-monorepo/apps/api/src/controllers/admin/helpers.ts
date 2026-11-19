/**
 * 后台控制器通用辅助：从请求上下文提取操作管理员 ID 与来源 IP。
 * 写操作统一把它传给 service，用于 admin_op_log 审计。
 */
import type { AppContext } from '../../types/context.js';
import { currentAdminId, getRequestIp } from '../../utils/request.js';

/** 后台写操作通用上下文：操作管理员 ID 与来源 IP（写入操作日志用）。 */
export function adminOperator(c: AppContext): { adminId: number; ip: string | undefined } {
  return { adminId: currentAdminId(c), ip: getRequestIp(c) };
}
