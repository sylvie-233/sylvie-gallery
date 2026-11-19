import { getAdminLogs } from '../../services/admin/log-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { LogListInput } from '../../validators/admin/system.js';

/** GET /api/admin/logs */
export async function list(c: AppContext, query: LogListInput): Promise<Response> {
  return success(c, await getAdminLogs(query));
}
