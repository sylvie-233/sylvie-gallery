import { createRoute } from '@hono/zod-openapi';

import * as uploadController from '../../controllers/admin/upload.controller.js';
import { AdminUploadResultSchema } from '../../openapi/models/admin.js';
import { errorResponses, successResponse } from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { uploadBodySchema } from '../../validators/admin/system.js';

const router = createApiRouter();

const uploadRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['后台 · 上传'],
  summary: '上传图片 / 视频 / 头像',
  request: {
    body: {
      content: { 'multipart/form-data': { schema: uploadBodySchema } },
      required: true,
    },
  },
  responses: { 201: successResponse(AdminUploadResultSchema, '上传成功'), ...errorResponses },
});

router.openapi(uploadRoute, routeHandler(uploadRoute, (c) => uploadController.upload(c)));

export default router;
