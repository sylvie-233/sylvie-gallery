import { createRoute } from '@hono/zod-openapi';

import * as authorController from '../../controllers/admin/author.controller.js';
import { AdminAuthorPageSchema, AdminAuthorRowSchema } from '../../openapi/models/admin.js';
import {
  errorResponses,
  idParamsSchema,
  jsonBody,
  nullSchema,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { authorInputSchema, authorListSchema } from '../../validators/admin/catalog.js';

const router = createApiRouter();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 作者'],
  summary: '后台作者列表',
  request: { query: authorListSchema },
  responses: { 200: successResponse(AdminAuthorPageSchema, '作者分页'), ...errorResponses },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/',
  tags: ['后台 · 作者'],
  summary: '新建作者',
  request: { body: jsonBody(authorInputSchema) },
  responses: { 201: successResponse(AdminAuthorRowSchema, '作者已创建'), ...errorResponses },
});

const updateRoute = createRoute({
  method: 'put',
  path: '/{id}',
  tags: ['后台 · 作者'],
  summary: '更新作者资料',
  request: { params: idParamsSchema, body: jsonBody(authorInputSchema) },
  responses: { 200: successResponse(AdminAuthorRowSchema, '作者已更新'), ...errorResponses },
});

const toggleRoute = createRoute({
  method: 'post',
  path: '/{id}/toggle',
  tags: ['后台 · 作者'],
  summary: '显示 / 隐藏作者',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(AdminAuthorRowSchema, '作者状态'), ...errorResponses },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['后台 · 作者'],
  summary: '删除作者（软删除）',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(nullSchema, '作者已删除'), ...errorResponses },
});

router.openapi(
  listRoute,
  routeHandler(listRoute, (c) => authorController.list(c, c.req.valid('query'))),
);
router.openapi(
  createRouteDef,
  routeHandler(createRouteDef, (c) => authorController.create(c, c.req.valid('json'))),
);
router.openapi(
  updateRoute,
  routeHandler(updateRoute, (c) =>
    authorController.update(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);
router.openapi(
  toggleRoute,
  routeHandler(toggleRoute, (c) => authorController.toggle(c, c.req.valid('param').id)),
);
router.openapi(
  deleteRoute,
  routeHandler(deleteRoute, (c) => authorController.remove(c, c.req.valid('param').id)),
);

export default router;
