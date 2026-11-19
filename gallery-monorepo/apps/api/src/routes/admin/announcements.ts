/**
 * 后台公告接口：列表、发布、更新、上下线与软删除。
 * 路由挂载于 /api/admin/announcements，写操作后失效公告与站点缓存。
 */
import { createRoute } from '@hono/zod-openapi';

import * as announcementController from '../../controllers/admin/announcement.controller.js';
import {
  AdminAnnouncementPageSchema,
  AdminAnnouncementRowSchema,
} from '../../openapi/models/admin.js';
import {
  errorResponses,
  idParamsSchema,
  jsonBody,
  nullSchema,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { announcementListSchema, announcementSaveSchema } from '../../validators/admin/content.js';

const router = createApiRouter();

/** GET /api/admin/announcements —— 公告分页，支持类型、状态、关键词与日期筛选。 */
const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 公告'],
  summary: '后台公告列表',
  request: { query: announcementListSchema },
  responses: { 200: successResponse(AdminAnnouncementPageSchema, '公告分页'), ...errorResponses },
});

/** POST /api/admin/announcements —— 发布公告，body 由 announcementSaveSchema 校验。 */
const createRouteDef = createRoute({
  method: 'post',
  path: '/',
  tags: ['后台 · 公告'],
  summary: '发布公告',
  request: { body: jsonBody(announcementSaveSchema) },
  responses: {
    201: successResponse(AdminAnnouncementRowSchema, '公告已发布'),
    ...errorResponses,
  },
});

/** PUT /api/admin/announcements/{id} —— 更新公告内容，id 取自路径参数。 */
const updateRoute = createRoute({
  method: 'put',
  path: '/{id}',
  tags: ['后台 · 公告'],
  summary: '更新公告',
  request: { params: idParamsSchema, body: jsonBody(announcementSaveSchema) },
  responses: { 200: successResponse(AdminAnnouncementRowSchema, '公告已更新'), ...errorResponses },
});

/** POST /api/admin/announcements/{id}/toggle —— 在发布/下线之间切换，无请求体。 */
const toggleRoute = createRoute({
  method: 'post',
  path: '/{id}/toggle',
  tags: ['后台 · 公告'],
  summary: '发布 / 下线公告',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(AdminAnnouncementRowSchema, '公告状态'), ...errorResponses },
});

/** DELETE /api/admin/announcements/{id} —— 软删除公告，不做物理删除。 */
const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['后台 · 公告'],
  summary: '删除公告（软删除）',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(nullSchema, '公告已删除'), ...errorResponses },
});

router.openapi(
  listRoute,
  routeHandler(listRoute, (c) => announcementController.list(c, c.req.valid('query'))),
);
router.openapi(
  createRouteDef,
  routeHandler(createRouteDef, (c) => announcementController.create(c, c.req.valid('json'))),
);
router.openapi(
  updateRoute,
  routeHandler(updateRoute, (c) =>
    announcementController.update(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);
router.openapi(
  toggleRoute,
  routeHandler(toggleRoute, (c) => announcementController.toggle(c, c.req.valid('param').id)),
);
router.openapi(
  deleteRoute,
  routeHandler(deleteRoute, (c) => announcementController.remove(c, c.req.valid('param').id)),
);

export default router;
