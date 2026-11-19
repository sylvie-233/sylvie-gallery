/**
 * 后台上传接口：接收 multipart 文件并按用途写入对象存储。
 * 支持 image / video / avatar 三种类型，均需管理员身份。
 */
import { createRoute } from '@hono/zod-openapi';

import * as uploadController from '../../controllers/admin/upload.controller.js';
import { AdminUploadResultSchema } from '../../openapi/models/admin.js';
import { errorResponses, successResponse } from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { uploadBodySchema } from '../../validators/admin/system.js';

const router = createApiRouter();

/** POST /api/admin/upload —— multipart/form-data，file 必填，kind 缺省为 image。 */
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
