import { Hono } from 'hono';
import { z } from 'zod';

import {
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  getAdminAnnouncements,
  toggleAdminAnnouncement,
  updateAdminAnnouncement,
} from '../../services/admin/announcement-admin.service.js';
import type { AppEnv } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { currentAdminId, getRequestIp } from '../../utils/request.js';
import { parseId, parseJson, parseQuery } from '../../utils/validate.js';

const router = new Hono<AppEnv>();

const listSchema = z.object({
  type: z.string().trim().max(16).optional(),
  status: z.string().trim().max(4).optional(),
  keyword: z.string().trim().max(128).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

router.get('/', async (c) => {
  const query = parseQuery(c, listSchema);
  return success(c, await getAdminAnnouncements(query));
});

const announcementSchema = z.object({
  type: z.enum(['update', 'activity', 'maintain', 'rule', 'notice']),
  title: z.string().trim().min(1, '请输入标题').max(128, '标题最多 128 个字符'),
  summary: z.string().max(255).optional(),
  content: z.string().max(20000).optional(),
  isTop: z.coerce.boolean().optional(),
});

router.post('/', async (c) => {
  const input = await parseJson(c, announcementSchema);
  return success(c, await createAdminAnnouncement(currentAdminId(c), input, getRequestIp(c)), '公告已发布', 201);
});

router.put('/:id', async (c) => {
  const id = parseId(c.req.param('id'), '公告 ID');
  const input = await parseJson(c, announcementSchema);
  return success(c, await updateAdminAnnouncement(currentAdminId(c), id, input, getRequestIp(c)), '公告已更新');
});

router.post('/:id/toggle', async (c) => {
  const id = parseId(c.req.param('id'), '公告 ID');
  const result = await toggleAdminAnnouncement(currentAdminId(c), id, getRequestIp(c));
  return success(c, result, result.status === 1 ? '公告已发布' : '公告已下线');
});

router.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'), '公告 ID');
  await deleteAdminAnnouncement(currentAdminId(c), id, getRequestIp(c));
  return success(c, null, '公告已删除');
});

export default router;
