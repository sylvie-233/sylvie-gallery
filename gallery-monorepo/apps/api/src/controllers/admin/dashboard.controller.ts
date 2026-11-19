/**
 * 后台看板控制器：概览统计与营收趋势查询。
 * 只读接口，不写日志、不触发缓存失效。
 */
import { getAdminDashboard, getAdminTrend } from '../../services/admin/dashboard.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { TrendInput } from '../../validators/admin/system.js';

/** GET /api/admin/dashboard —— 汇总用户、图集、订单与营收等看板指标。 */
export async function dashboard(c: AppContext) {
  return success(c, await getAdminDashboard());
}

/** GET /api/admin/dashboard/trend —— 参数来自 query.mode（7d/30d/6m），返回对应区间趋势。 */
export async function trend(c: AppContext, input: TrendInput) {
  return success(c, await getAdminTrend(input.mode));
}
