import { Hono } from 'hono';

import { optionalAuth } from '../middleware/auth.js';
import { getConfigMap, getSiteBootstrap } from '../services/site.service.js';
import type { AppEnv } from '../types/context.js';
import { success } from '../utils/http.js';

const router = new Hono<AppEnv>();

router.get('/bootstrap', optionalAuth, async (c) => {
  const user = c.get('currentUser');
  return success(c, await getSiteBootstrap(user?.id));
});

router.get('/config', async (c) => {
  return success(c, await getConfigMap());
});

export default router;
