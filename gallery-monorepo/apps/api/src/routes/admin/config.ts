import { Hono } from 'hono';
import { z } from 'zod';

import {
  createAdminFriendLink,
  deleteAdminFriendLink,
  getAdminConfigBundle,
  updateAdminPlan,
  updateAdminSiteConfig,
} from '../../services/admin/config-admin.service.js';
import type { AppEnv } from '../../types/context.js';
import { success } from '../../utils/http.js';
import { currentAdminId, getRequestIp } from '../../utils/request.js';
import { parseId, parseJson } from '../../utils/validate.js';

const router = new Hono<AppEnv>();

router.get('/', async (c) => {
  return success(c, await getAdminConfigBundle());
});

const siteSchema = z.object({
  copyright: z.string().max(255).default(''),
  icpNo: z.string().max(64).default(''),
  ageStatement: z.string().max(255).default(''),
  disclaimer: z.string().max(255).default(''),
  checkinPoints: z.coerce.number().int().min(1).max(99).default(2),
  watermarkOn: z.coerce.boolean().default(true),
});

router.put('/site', async (c) => {
  const input = await parseJson(c, siteSchema);
  return success(
    c,
    await updateAdminSiteConfig(currentAdminId(c), input, getRequestIp(c)),
    '站点配置已保存',
  );
});

const planSchema = z.object({
  priceCents: z.coerce.number().int().min(1).max(1000000),
  durationDays: z.coerce.number().int().min(1).max(365),
  benefits: z.array(z.string().trim().max(100)).min(1).max(12),
});

router.put('/plan', async (c) => {
  const input = await parseJson(c, planSchema);
  return success(c, await updateAdminPlan(currentAdminId(c), input, getRequestIp(c)), '会员套餐已保存');
});

const friendSchema = z.object({
  name: z.string().trim().min(1, '请输入站名').max(32),
  slogan: z.string().trim().max(64).optional(),
  url: z.string().trim().min(1, '请输入链接').max(255),
});

router.post('/friends', async (c) => {
  const input = await parseJson(c, friendSchema);
  return success(
    c,
    await createAdminFriendLink(currentAdminId(c), input, getRequestIp(c)),
    '友链已添加',
    201,
  );
});

router.delete('/friends/:id', async (c) => {
  const id = parseId(c.req.param('id'), '友链 ID');
  await deleteAdminFriendLink(currentAdminId(c), id, getRequestIp(c));
  return success(c, null, '友链已删除');
});

export default router;
