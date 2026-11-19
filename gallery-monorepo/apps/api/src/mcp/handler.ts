import { StreamableHTTPTransport } from '@hono/mcp';

import { requireUser } from '../controllers/helpers.js';
import { env } from '../config/env.js';
import type { AppContext } from '../types/context.js';
import { HttpError, failure } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { createMcpServer } from './server.js';

/**
 * MCP Streamable HTTP 处理：
 * - 每个请求创建独立的 Server / Transport（无状态），管理员身份从 JWT 注入；
 * - 工具直接复用 services，读写权限由 MCP_ALLOW_WRITE 控制。
 */
export async function handleMcpRequest(c: AppContext): Promise<Response> {
  if (env.MCP_ENABLED !== 'true') {
    return failure(c, 404, 'MCP 未启用');
  }

  const admin = requireUser(c);
  const scope = c.get('agentToken')?.scope;
  // 写工具需要服务端开关打开；使用 Agent 令牌时还要求 scope=write。
  const allowWrite =
    env.MCP_ALLOW_WRITE === 'true' && (scope === undefined || scope === 'write');
  const server = createMcpServer(admin, allowWrite);
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(c);
    if (!response) {
      throw new HttpError(400, '不支持的 MCP 请求');
    }
    logger.debug('MCP 请求已处理', { adminId: admin.id, method: c.req.method });
    return response;
  } catch (error) {
    logger.error('MCP 请求处理失败', error, { adminId: admin.id });
    throw error;
  }
}
