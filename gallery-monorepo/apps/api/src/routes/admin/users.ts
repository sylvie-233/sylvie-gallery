import { Hono } from 'hono';
import { z } from 'zod';

import {
  adjustAdminUserPoints,
  getAdminUsers,
  grantAdminUserVip,
  resetAdminUserPassword,
  toggleAdminUserStatus,
} from '../../services/admin/user-admin.service.js';
import type { AppEnv } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { currentAdminId, getRequestIp } from '../../utils/request.js';
import { parseId, parseJson, parseQuery } from '../../utils/validate.js';

const router = new Hono<AppEnv>();

const listSchema = z.object({
  role: z.enum(['all', 'admin', 'vip', 'member']).optional(),
  status: z.enum(['all', '0', '1']).optional(),
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
});

router.get('/', async (c) => {
  const query = parseQuery(c, listSchema);
  return success(c, await getAdminUsers(query));
});

const pointsSchema = z.object({
  delta: z.coerce.number().int().min(-99999).max(99999),
  reason: z.string().trim().min(1, '请填写调整原因').max(64),
});

router.post('/:id/points', async (c) => {
  const id = parseId(c.req.param('id'), '用户 ID');
  const input = await parseJson(c, pointsSchema);
  return success(
    c,
    await adjustAdminUserPoints(currentAdminId(c), id, input, getRequestIp(c)),
    '积分已调整',
  );
});

router.post('/:id/grant-vip', async (c) => {
  const id = parseId(c.req.param('id'), '用户 ID');
  return success(
    c,
    await grantAdminUserVip(currentAdminId(c), id, getRequestIp(c)),
    '已赠送 30 天付费会员',
  );
});

router.post('/:id/reset-password', async (c) => {
  const id = parseId(c.req.param('id'), '用户 ID');
  return success(
    c,
    await resetAdminUserPassword(currentAdminId(c), id, getRequestIp(c)),
    '密码已重置',
  );
});

router.post('/:id/toggle-status', async (c) => {
  const id = parseId(c.req.param('id'), '用户 ID');
  const result = await toggleAdminUserStatus(currentAdminId(c), id, getRequestIp(c));
  return success(c, result, result.status === 1 ? '用户已解封' : '用户已封禁');
});

export default router;
