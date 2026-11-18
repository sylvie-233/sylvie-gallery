import { Hono } from 'hono';
import { z } from 'zod';

import {
  createAdminAuthor,
  deleteAdminAuthor,
  getAdminAuthors,
  toggleAdminAuthor,
  updateAdminAuthor,
} from '../../services/admin/author-admin.service.js';
import type { AppEnv } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { currentAdminId, getRequestIp } from '../../utils/request.js';
import { parseId, parseJson, parseQuery } from '../../utils/validate.js';

const router = new Hono<AppEnv>();

const listSchema = z.object({
  status: z.enum(['all', 'on', 'off']).optional(),
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

router.get('/', async (c) => {
  const query = parseQuery(c, listSchema);
  return success(c, await getAdminAuthors(query));
});

const authorSchema = z.object({
  name: z.string().trim().min(1, '请输入作者名').max(32, '作者名最多 32 个字符'),
  alias: z.string().trim().max(64).optional(),
  initial: z.string().trim().max(8).optional(),
  color: z.string().trim().max(16).optional(),
  avatarUrl: z.string().trim().max(512).nullable().optional(),
  bio: z.string().max(500).optional(),
  styleTags: z.array(z.string().trim().max(16)).max(8).optional(),
  sortWeight: z.coerce.number().int().min(-9999).max(9999).optional(),
});

router.post('/', async (c) => {
  const input = await parseJson(c, authorSchema);
  return success(c, await createAdminAuthor(currentAdminId(c), input, getRequestIp(c)), '作者已创建', 201);
});

router.put('/:id', async (c) => {
  const id = parseId(c.req.param('id'), '作者 ID');
  const input = await parseJson(c, authorSchema);
  return success(c, await updateAdminAuthor(currentAdminId(c), id, input, getRequestIp(c)), '作者已更新');
});

router.post('/:id/toggle', async (c) => {
  const id = parseId(c.req.param('id'), '作者 ID');
  const result = await toggleAdminAuthor(currentAdminId(c), id, getRequestIp(c));
  return success(c, result, result.status === 1 ? '作者已恢复展示' : '作者已隐藏');
});

router.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'), '作者 ID');
  await deleteAdminAuthor(currentAdminId(c), id, getRequestIp(c));
  return success(c, null, '作者已删除');
});

export default router;
