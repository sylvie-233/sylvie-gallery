/**
 * 前台标签接口：标签云列表，按收录套数（useCount）排序。
 * 只读、匿名可访问，标签的新建 / 改名 / 隐藏由管理后台维护。
 */
import { createRoute, z } from '@hono/zod-openapi';

import * as tagController from '../controllers/tag.controller.js';
import { TagDtoSchema } from '../openapi/models/album.js';
import { errorResponses, successResponse } from '../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';

const router = createApiRouter();

/**
 * GET /api/tags —— 前台标签云。
 * 鉴权：无；返回全部启用标签（含 useCount），`#` 前缀由前端展示时拼接。
 */
const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['标签'],
  summary: '前台标签云',
  description: '按收录套数排序，展示时统一添加 # 前缀。',
  security: [],
  responses: {
    200: successResponse(z.array(TagDtoSchema), '标签列表'),
    ...errorResponses,
  },
});

router.openapi(listRoute, routeHandler(listRoute, (c) => tagController.list(c)));

export default router;
