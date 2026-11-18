import { Hono } from 'hono';

import { listTags } from '../services/tag.service.js';
import type { AppEnv } from '../types/context.js';
import { success } from '../utils/http.js';

const router = new Hono<AppEnv>();

router.get('/', async (c) => {
  return success(c, await listTags());
});

export default router;
