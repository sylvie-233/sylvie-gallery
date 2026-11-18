import { Hono } from 'hono';
import { z } from 'zod';

import { authenticate } from '../middleware/auth.js';
import { listFavoriteAlbums } from '../services/album.service.js';
import { listSubscribedAuthors } from '../services/author.service.js';
import type { AppEnv } from '../types/context.js';
import { HttpError, success } from '../utils/http.js';
import { parseQuery } from '../utils/validate.js';

const router = new Hono<AppEnv>();

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(36).optional(),
});

router.get('/favorites', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const query = parseQuery(c, pageSchema);
  return success(c, await listFavoriteAlbums(user.id, query.page, query.pageSize));
});

router.get('/subscriptions', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const query = parseQuery(c, pageSchema);
  return success(c, await listSubscribedAuthors(user.id, query.page, query.pageSize));
});

export default router;
