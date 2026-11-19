import { z } from '@hono/zod-openapi';

import * as fileController from '../controllers/file.controller.js';
import { binaryResponse, ErrorResponseSchema, jsonContent } from '../openapi/models/common.js';
import { createApiRouter } from '../openapi/router.js';

const router = createApiRouter();

/**
 * 对象存储代理：文件 key 含 `/`，需要正则路径，因此使用普通 Hono 路由，
 * OpenAPI 文档通过 registry 手动注册同样的路径。
 */
router.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{key}',
  tags: ['文件'],
  summary: '对象存储代理读取',
  description: '仅允许 avatars/、albums/、authors/ 前缀。',
  request: {
    params: z.object({
      key: z.string().openapi({ param: { name: 'key', in: 'path' }, description: '对象键' }),
    }),
  },
  responses: {
    200: binaryResponse('application/octet-stream', '文件二进制流'),
    404: {
      content: jsonContent(ErrorResponseSchema),
      description: '文件不存在',
    },
  },
});

router.get('/:key{.+}', (c) => fileController.proxy(c));

export default router;
