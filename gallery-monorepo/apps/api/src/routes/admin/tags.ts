import { createRoute } from '@hono/zod-openapi';

import * as tagController from '../../controllers/admin/tag.controller.js';
import { AdminTagPageSchema, AdminTagRowSchema } from '../../openapi/models/admin.js';
import {
  errorResponses,
  idParamsSchema,
  jsonBody,
  nullSchema,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { tagListSchema, tagNameSchema } from '../../validators/admin/catalog.js';

const router = createApiRouter();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 标签'],
  summary: '后台标签列表',
  request: { query: tagListSchema },
  responses: { 200: successResponse(AdminTagPageSchema, '标签分页'), ...errorResponses },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/',
  tags: ['后台 · 标签'],
  summary: '新建标签',
  request: { body: jsonBody(tagNameSchema) },
  responses: { 201: successResponse(AdminTagRowSchema, '标签已创建'), ...errorResponses },
});

const updateRoute = createRoute({
  method: 'put',
  path: '/{id}',
  tags: ['后台 · 标签'],
  summary: '重命名标签',
  request: { params: idParamsSchema, body: jsonBody(tagNameSchema) },
  responses: { 200: successResponse(AdminTagRowSchema, '标签已更新'), ...errorResponses },
});

const toggleRoute = createRoute({
  method: 'post',
  path: '/{id}/toggle',
  tags: ['后台 · 标签'],
  summary: '显示 / 隐藏标签',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(AdminTagRowSchema, '标签状态'), ...errorResponses },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['后台 · 标签'],
  summary: '删除标签（仅未被收录可删）',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(nullSchema, '标签已删除'), ...errorResponses },
});

router.openapi(listRoute, routeHandler(listRoute, (c) => tagController.list(c, c.req.valid('query'))));
router.openapi(
  createRouteDef,
  routeHandler(createRouteDef, (c) => tagController.create(c, c.req.valid('json'))),
);
router.openapi(
  updateRoute,
  routeHandler(updateRoute, (c) =>
    tagController.update(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);
router.openapi(
  toggleRoute,
  routeHandler(toggleRoute, (c) => tagController.toggle(c, c.req.valid('param').id)),
);
router.openapi(
  deleteRoute,
  routeHandler(deleteRoute, (c) => tagController.remove(c, c.req.valid('param').id)),
);

export default router;
