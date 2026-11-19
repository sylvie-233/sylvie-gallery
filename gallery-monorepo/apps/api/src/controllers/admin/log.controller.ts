/**
 * 后台操作日志控制器：只读分页查询 admin_op_log。
 * 不产生任何写操作。
 */
import { getAdminLogs } from '../../services/admin/log-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { LogListInput } from '../../validators/admin/system.js';

/** GET /api/admin/logs —— 参数来自 query，按动作、关键词与日期分页查询。 */
export async function list(c: AppContext, query: LogListInput) {
  return success(c, await getAdminLogs(query));
}
