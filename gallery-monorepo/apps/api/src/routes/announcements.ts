import { Hono } from 'hono';
import { z } from 'zod';

import { optionalAuth } from '../middleware/auth.js';
import { listAnnouncements } from '../services/announcement.service.js';
import type { AppEnv } from '../types/context.js';
import { success } from '../utils/http.js';
import { parseQuery } from '../utils/validate.js';

const router = new Hono<AppEnv>();

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
  keyword: z.string().trim().max(64).optional(),
});

router.get('/', optionalAuth, async (c) => {
  const query = parseQuery(c, querySchema);
  const user = c.get('currentUser');
  return success(c, await listAnnouncements(query, user?.id));
});

export default router;
