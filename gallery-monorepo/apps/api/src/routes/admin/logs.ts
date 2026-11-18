import { Hono } from 'hono';
import { z } from 'zod';

import { getAdminLogs } from '../../services/admin/log-admin.service.js';
import type { AppEnv } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { parseQuery } from '../../utils/validate.js';

const router = new Hono<AppEnv>();

const listSchema = z.object({
  action: z.string().trim().max(64).optional(),
  keyword: z.string().trim().max(128).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

router.get('/', async (c) => {
  const query = parseQuery(c, listSchema);
  return success(c, await getAdminLogs(query));
});

export default router;
