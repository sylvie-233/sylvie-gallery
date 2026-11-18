import { Hono } from 'hono';
import { z } from 'zod';

import { optionalAuth } from '../middleware/auth.js';
import { getFeed } from '../services/album.service.js';
import type { AppEnv } from '../types/context.js';
import { success } from '../utils/http.js';
import { parseQuery } from '../utils/validate.js';

const router = new Hono<AppEnv>();

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(36).default(24),
});

router.get('/', optionalAuth, async (c) => {
  const query = parseQuery(c, querySchema);
  const user = c.get('currentUser');
  return success(c, await getFeed(query.page, query.pageSize, user?.id));
});

export default router;
