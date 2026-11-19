/**
 * 前台公告接口：只读分页列表，按置顶优先排序，支持关键词检索。
 * 公告的发布 / 编辑 / 上下线在管理后台完成，这里仅暴露已发布内容。
 */
import { createRoute } from '@hono/zod-openapi';

import * as announcementController from '../controllers/announcement.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { errorResponses, successResponse } from '../openapi/models/common.js';
import { AnnouncementPageResultSchema } from '../openapi/models/content.js';
import { createApiRouter, routeHandler } from '../openapi/router.js';
import { announcementListSchema } from '../validators/misc.js';

const router = createApiRouter();

/**
 * GET /api/announcements —— 公告分页列表。
 * 鉴权：optionalAuth（游客可读）；query 经 announcementListSchema（页码、每页 ≤48、关键词 ≤64 字）。
 * 响应：置顶公告优先，随后按发布时间倒序。
 */
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
