import { getAdminDashboard, getAdminTrend } from '../../services/admin/dashboard.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { TrendInput } from '../../validators/admin/system.js';

/** GET /api/admin/dashboard */
export async function dashboard(c: AppContext): Promise<Response> {
  return success(c, await getAdminDashboard());
}

/** GET /api/admin/dashboard/trend */
export async function trend(c: AppContext, input: TrendInput): Promise<Response> {
  return success(c, await getAdminTrend(input.mode));
}
