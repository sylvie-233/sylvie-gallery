import { Hono } from 'hono';
import { z } from 'zod';

import { getAdminDashboard, getAdminTrend } from '../../services/admin/dashboard.service.js';
import type { AppEnv } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { parseQuery } from '../../utils/validate.js';

const router = new Hono<AppEnv>();

router.get('/', async (c) => {
  return success(c, await getAdminDashboard());
});

const trendSchema = z.object({
  mode: z.enum(['7d', '30d', '6m']).default('7d'),
});

router.get('/trend', async (c) => {
  const query = parseQuery(c, trendSchema);
  return success(c, await getAdminTrend(query.mode));
});

export default router;
