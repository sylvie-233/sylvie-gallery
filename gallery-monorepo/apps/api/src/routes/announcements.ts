import { createRoute } from '@hono/zod-openapi';

import * as announcementController from '../controllers/announcement.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { errorResponses, successResponse } from '../openapi/models/common.js';
import { AnnouncementPageResultSchema } from '../openapi/models/content.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { announcementListSchema } from '../validators/misc.js';

const router = createApiRouter();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['公告'],
  summary: '公告列表',
  description: '置顶优先，支持标题 / 摘要 / 正文 / 类型关键词搜索。',
  security: [],
  middleware: [optionalAuth],
  request: { query: announcementListSchema },
  responses: {
    200: successResponse(AnnouncementPageResultSchema, '公告分页列表'),
    ...errorResponses,
  },
});

router.openapi(
  listRoute,
  routeHandler(listRoute, (c) => announcementController.list(c, c.req.valid('query'))),
);

export default router;
