import { Hono } from 'hono';
import { z } from 'zod';

import {
  deleteAdminComment,
  getAdminComments,
  reviewAdminComment,
} from '../../services/admin/comment-admin.service.js';
import type { AppEnv } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { currentAdminId, getRequestIp } from '../../utils/request.js';
import { parseId, parseJson, parseQuery } from '../../utils/validate.js';

const router = new Hono<AppEnv>();

const listSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  keyword: z.string().trim().max(64).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

router.get('/', async (c) => {
  const query = parseQuery(c, listSchema);
  return success(c, await getAdminComments(query));
});

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

router.post('/:id/review', async (c) => {
  const id = parseId(c.req.param('id'), '评论 ID');
  const input = await parseJson(c, reviewSchema);
  const result = await reviewAdminComment(currentAdminId(c), id, input.status, getRequestIp(c));
  return success(c, result, input.status === 'approved' ? '评论已通过' : '评论已拒绝');
});

router.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'), '评论 ID');
  await deleteAdminComment(currentAdminId(c), id, getRequestIp(c));
  return success(c, null, '评论已删除');
});

export default router;
