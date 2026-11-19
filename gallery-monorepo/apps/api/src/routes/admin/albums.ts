import { createRoute } from '@hono/zod-openapi';

import * as albumController from '../../controllers/admin/album.controller.js';
import {
  AdminAlbumDetailSchema,
  AdminAlbumPageSchema,
  AdminRecommendResultSchema,
} from '../../openapi/models/admin.js';
import {
  errorResponses,
  idParamsSchema,
  jsonBody,
  nullSchema,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import {
  albumListSchema,
  albumSaveSchema,
  albumStatusInputSchema,
} from '../../validators/admin/catalog.js';

const router = createApiRouter();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 图集'],
  summary: '后台图集列表',
  request: { query: albumListSchema },
  responses: { 200: successResponse(AdminAlbumPageSchema, '图集分页'), ...errorResponses },
});

const detailRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['后台 · 图集'],
  summary: '后台图集详情（含全部媒体）',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(AdminAlbumDetailSchema, '图集详情'), ...errorResponses },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/',
  tags: ['后台 · 图集'],
  summary: '发布 / 保存图集',
  request: { body: jsonBody(albumSaveSchema) },
  responses: { 201: successResponse(AdminAlbumDetailSchema, '图集已保存'), ...errorResponses },
});

const updateRoute = createRoute({
  method: 'put',
  path: '/{id}',
  tags: ['后台 · 图集'],
  summary: '更新图集',
  request: { params: idParamsSchema, body: jsonBody(albumSaveSchema) },
  responses: { 200: successResponse(AdminAlbumDetailSchema, '图集已更新'), ...errorResponses },
});

const statusRoute = createRoute({
  method: 'post',
  path: '/{id}/status',
  tags: ['后台 · 图集'],
  summary: '发布 / 下架图集',
  request: { params: idParamsSchema, body: jsonBody(albumStatusInputSchema) },
  responses: { 200: successResponse(AdminAlbumDetailSchema, '图集状态'), ...errorResponses },
});

const recommendRoute = createRoute({
  method: 'post',
  path: '/{id}/recommend',
  tags: ['后台 · 图集'],
  summary: '加入 / 移出瀑布流推荐池',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(AdminRecommendResultSchema, '推荐状态'), ...errorResponses },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['后台 · 图集'],
  summary: '删除图集（软删除）',
  request: { params: idParamsSchema },
  responses: { 200: successResponse(nullSchema, '图集已删除'), ...errorResponses },
});

router.openapi(
  listRoute,
  routeHandler(listRoute, (c) => albumController.list(c, c.req.valid('query'))),
);
router.openapi(
  detailRoute,
  routeHandler(detailRoute, (c) => albumController.detail(c, c.req.valid('param').id)),
);
router.openapi(
  createRouteDef,
  routeHandler(createRouteDef, (c) => albumController.create(c, c.req.valid('json'))),
);
router.openapi(
  updateRoute,
  routeHandler(updateRoute, (c) =>
    albumController.update(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);
router.openapi(
  statusRoute,
  routeHandler(statusRoute, (c) =>
    albumController.updateStatus(c, c.req.valid('param').id, c.req.valid('json')),
  ),
);
router.openapi(
  recommendRoute,
  routeHandler(recommendRoute, (c) => albumController.toggleRecommend(c, c.req.valid('param').id)),
);
router.openapi(
  deleteRoute,
  routeHandler(deleteRoute, (c) => albumController.remove(c, c.req.valid('param').id)),
);

export default router;
