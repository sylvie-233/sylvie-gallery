/**
 * 后台 Agent 令牌接口：列表、创建、吊销与删除。
 * 明文令牌只在创建时返回一次；scope 分 read/write，吊销后立即失效。
 */
import { createRoute, z } from '@hono/zod-openapi';

import * as agentTokenController from '../../controllers/admin/agent-token.controller.js';
import {
  AdminAgentTokenCreateResultSchema,
  AdminAgentTokenRowSchema,
} from '../../openapi/models/admin.js';
import {
  errorResponses,
  idParamsSchema,
  jsonBody,
  nullSchema,
  successResponse,
} from '../../openapi/models/common.js';
import { createApiRouter, routeHandler } from '../../openapi/router.js';
import { createAgentTokenSchema } from '../../validators/admin/agent-token.js';

const router = createApiRouter();

/** GET /api/admin/agent-tokens —— 不返回明文，仅展示前缀、权限、状态与使用情况。 */
const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['后台 · 令牌'],
  summary: 'Agent 令牌列表',
  description: '不返回明文令牌，仅展示前缀、权限、状态与使用情况。',
  responses: {
    200: successResponse(z.array(AdminAgentTokenRowSchema), '令牌列表'),
    ...errorResponses,
  },
});

/** POST /api/admin/agent-tokens —— body 校验名称 ≤32、scope 与可选有效期；明文仅本次响应返回。 */
const createRouteDef = createRoute({
  method: 'post',
  path: '/',
  tags: ['后台 · 令牌'],
  summary: '创建 Agent 令牌',
  description: '明文令牌只在创建响应中返回一次；scope=read 只能查询，scope=write 可执行管理写操作。',
  request: { body: jsonBody(createAgentTokenSchema) },
  responses: {
    201: successResponse(AdminAgentTokenCreateResultSchema, '令牌已创建'),
    ...errorResponses,
  },
});

/** POST /api/admin/agent-tokens/{id}/revoke —— 吊销令牌，立即失效且不可恢复。 */
const revokeRoute = createRoute({
  method: 'post',
  path: '/{id}/revoke',
  tags: ['后台 · 令牌'],
  summary: '吊销 Agent 令牌',
  description: '吊销后令牌立即失效，不可恢复。',
  request: { params: idParamsSchema },
  responses: {
    200: successResponse(AdminAgentTokenRowSchema, '令牌已吊销'),
    ...errorResponses,
  },
});

/** DELETE /api/admin/agent-tokens/{id} —— 仅允许删除已吊销的令牌。 */
const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['后台 · 令牌'],
  summary: '删除已吊销的 Agent 令牌',
  description: '仅允许删除已吊销令牌；有效令牌需先吊销，操作会写入管理日志。',
  request: { params: idParamsSchema },
  responses: {
    200: successResponse(nullSchema, '令牌已删除'),
    ...errorResponses,
  },
});

router.openapi(listRoute, routeHandler(listRoute, (c) => agentTokenController.list(c)));
router.openapi(
  createRouteDef,
  routeHandler(createRouteDef, (c) => agentTokenController.create(c, c.req.valid('json'))),
);
router.openapi(
  revokeRoute,
  routeHandler(revokeRoute, (c) => agentTokenController.revoke(c, c.req.valid('param').id)),
);
router.openapi(
  deleteRoute,
  routeHandler(deleteRoute, (c) => agentTokenController.remove(c, c.req.valid('param').id)),
);

export default router;
