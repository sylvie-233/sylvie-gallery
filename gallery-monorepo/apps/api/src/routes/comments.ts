import { Hono } from 'hono';

import { authenticate } from '../middleware/auth.js';
import { deleteComment } from '../services/album.service.js';
import type { AppEnv } from '../types/context.js';
import { HttpError, success } from '../utils/http.js';
import { parseId } from '../utils/validate.js';

const router = new Hono<AppEnv>();

router.delete('/:id', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const id = parseId(c.req.param('id'), '评论 ID');
  await deleteComment(id, user.id);
  return success(c, null, '评论已删除');
});

export default router;
