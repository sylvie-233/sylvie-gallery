import { Hono } from 'hono';
import { z } from 'zod';

import { authenticate, optionalAuth } from '../middleware/auth.js';
import {
  getAuthorDetail,
  listAuthors,
  toggleSubscription,
} from '../services/author.service.js';
import type { AppEnv } from '../types/context.js';
import { HttpError, success } from '../utils/http.js';
import { parseId, parseQuery } from '../utils/validate.js';

const router = new Hono<AppEnv>();

const listSchema = z.object({
  keyword: z.string().trim().max(32).optional(),
});

router.get('/', optionalAuth, async (c) => {
  const query = parseQuery(c, listSchema);
  const user = c.get('currentUser');
  return success(c, await listAuthors(query.keyword, user?.id));
});

const detailSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(36).optional(),
});

router.get('/:id', optionalAuth, async (c) => {
  const id = parseId(c.req.param('id'), '作者 ID');
  const query = parseQuery(c, detailSchema);
  const user = c.get('currentUser');
  return success(c, await getAuthorDetail(id, user?.id, query.page, query.pageSize));
});

router.post('/:id/subscribe', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const id = parseId(c.req.param('id'), '作者 ID');
  const result = await toggleSubscription(id, user.id);
  return success(c, result, result.subscribed ? '已订阅该作者' : '已取消订阅');
});

export default router;
