import { Hono } from 'hono';
import { z } from 'zod';

import {
  createAdminTag,
  deleteAdminTag,
  getAdminTags,
  toggleAdminTag,
  updateAdminTag,
} from '../../services/admin/tag-admin.service.js';
import type { AppEnv } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { currentAdminId, getRequestIp } from '../../utils/request.js';
import { parseId, parseJson, parseQuery } from '../../utils/validate.js';

const router = new Hono<AppEnv>();

const listSchema = z.object({
  status: z.enum(['all', 'on', 'off']).optional(),
  keyword: z.string().trim().max(32).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

router.get('/', async (c) => {
  const query = parseQuery(c, listSchema);
  return success(c, await getAdminTags(query));
});

const nameSchema = z.object({
  name: z.string().trim().min(1, '请输入标签名').max(20, '标签名最多 20 个字符'),
});

router.post('/', async (c) => {
  const input = await parseJson(c, nameSchema);
  return success(c, await createAdminTag(currentAdminId(c), input.name, getRequestIp(c)), '标签已创建', 201);
});

router.put('/:id', async (c) => {
  const id = parseId(c.req.param('id'), '标签 ID');
  const input = await parseJson(c, nameSchema);
  return success(c, await updateAdminTag(currentAdminId(c), id, input.name, getRequestIp(c)), '标签已更新');
});

router.post('/:id/toggle', async (c) => {
  const id = parseId(c.req.param('id'), '标签 ID');
  const result = await toggleAdminTag(currentAdminId(c), id, getRequestIp(c));
  return success(c, result, result.status === 1 ? '标签已恢复展示' : '标签已隐藏');
});

router.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'), '标签 ID');
  await deleteAdminTag(currentAdminId(c), id, getRequestIp(c));
  return success(c, null, '标签已删除');
});

export default router;
