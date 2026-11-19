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

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 公告'],
  summary: '后台公告列表',
  request: { query: announcementListSchema },
  responses: { 200: successResponse(AdminAnnouncementPageSchema, '公告分页'), ...errorResponses },
});

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

const updateRoute = createRoute({
  method: 'put',
  path: '/{id}',
  tags: ['后台 · 公告'],
  summary: '更新公告',
  request: { params: idParamsSchema, body: jsonBody(announcementSaveSchema) },
  responses: { 200: successResponse(AdminAnnouncementRowSchema, '公告已更新'), ...errorResponses },
});

const toggleRoute = createRoute({
  method: 'post',
  path: '/{id}/toggle',
  tags: ['后台 · 公告'],
  summary: '发布 / 下线公告',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(AdminAnnouncementRowSchema, '公告状态'), ...errorResponses },
});

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
