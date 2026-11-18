import { Hono } from 'hono';
import { z } from 'zod';

import {
  deleteAdminAlbum,
  getAdminAlbumDetail,
  getAdminAlbums,
  saveAdminAlbum,
  toggleAdminAlbumRecommend,
  updateAdminAlbumStatus,
} from '../../services/admin/album-admin.service.js';
import type { AppEnv } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { currentAdminId, getRequestIp } from '../../utils/request.js';
import { parseId, parseJson, parseQuery } from '../../utils/validate.js';

const router = new Hono<AppEnv>();

const listSchema = z.object({
  status: z.enum(['all', 'published', 'draft', 'offline']).optional(),
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

router.get('/', async (c) => {
  const query = parseQuery(c, listSchema);
  return success(c, await getAdminAlbums(query));
});

const mediaSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  url: z.string().trim().min(1).max(512),
  thumbUrl: z.string().trim().max(512).nullable().optional(),
  watermarkUrl: z.string().trim().max(512).nullable().optional(),
  width: z.coerce.number().int().positive().nullable().optional(),
  height: z.coerce.number().int().positive().nullable().optional(),
  duration: z.coerce.number().int().nonnegative().nullable().optional(),
  size: z.coerce.number().nonnegative().optional(),
});

const saveSchema = z.object({
  title: z.string().trim().min(1, '请输入标题').max(60, '标题最多 60 个字符'),
  authorId: z.coerce.number().int().positive(),
  points: z.coerce.number().int().min(0).max(99).default(0),
  description: z.string().max(1000).optional(),
  tagIds: z.array(z.coerce.number().int().positive()).max(8).default([]),
  coverUrl: z.string().trim().max(512).nullable().optional(),
  status: z.enum(['draft', 'published', 'offline']).optional(),
  images: z.array(mediaSchema).max(99).default([]),
  videos: z.array(mediaSchema).max(3).default([]),
});

router.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'), '图集 ID');
  return success(c, await getAdminAlbumDetail(id));
});

router.post('/', async (c) => {
  const input = await parseJson(c, saveSchema);
  const result = await saveAdminAlbum(currentAdminId(c), input, null, getRequestIp(c));
  return success(c, result, '图集已保存', 201);
});

router.put('/:id', async (c) => {
  const id = parseId(c.req.param('id'), '图集 ID');
  const input = await parseJson(c, saveSchema);
  const result = await saveAdminAlbum(currentAdminId(c), input, id, getRequestIp(c));
  return success(c, result, '图集已更新');
});

const statusSchema = z.object({
  status: z.enum(['published', 'offline']),
});

router.post('/:id/status', async (c) => {
  const id = parseId(c.req.param('id'), '图集 ID');
  const input = await parseJson(c, statusSchema);
  const result = await updateAdminAlbumStatus(currentAdminId(c), id, input.status, getRequestIp(c));
  return success(c, result, input.status === 'published' ? '图集已发布' : '图集已下架');
});

router.post('/:id/recommend', async (c) => {
  const id = parseId(c.req.param('id'), '图集 ID');
  const result = await toggleAdminAlbumRecommend(currentAdminId(c), id, getRequestIp(c));
  return success(c, result, result.isRecommended ? '已加入推荐池' : '已移出推荐池');
});

router.delete('/:id', async (c) => {
  const id = parseId(c.req.param('id'), '图集 ID');
  await deleteAdminAlbum(currentAdminId(c), id, getRequestIp(c));
  return success(c, null, '图集已删除');
});

export default router;
