import { Hono } from 'hono';
import { z } from 'zod';

import { authenticate } from '../middleware/auth.js';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notification.service.js';
import type { AppEnv } from '../types/context.js';
import { HttpError, success } from '../utils/http.js';
import { parseId, parseQuery } from '../utils/validate.js';

const router = new Hono<AppEnv>();

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(24).optional(),
  filter: z.enum(['all', 'unread']).optional(),
});

router.get('/', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const query = parseQuery(c, querySchema);
  return success(c, await listNotifications(user.id, query));
});

router.post('/:id/read', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const id = parseId(c.req.param('id'), '通知 ID');
  await markNotificationRead(user.id, id);
  return success(c, null, '已标记为已读');
});

router.post('/read-all', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  await markAllNotificationsRead(user.id);
  return success(c, null, '全部通知已标记为已读');
});

export default router;
