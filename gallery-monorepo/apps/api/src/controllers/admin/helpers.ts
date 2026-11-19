import type { AppContext } from '../../types/context.js';
import { currentAdminId, getRequestIp } from '../../utils/request.js';

/** 后台写操作通用上下文：操作管理员 ID 与来源 IP。 */
export function adminOperator(c: AppContext): { adminId: number; ip: string | undefined } {
  return { adminId: currentAdminId(c), ip: getRequestIp(c) };
}
