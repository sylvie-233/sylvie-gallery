/**
 * MCP Server 组装：
 * 为单次请求创建独立实例，注册只读工具，并在允许时追加写工具。
 * 工具以当前管理员身份执行，复用与 REST 相同的 service 逻辑。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AuthUser } from '../types/context.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';

/**
 * 创建一次请求使用的 MCP Server 实例，工具以当前管理员身份执行。
 *
 * @param admin 已通过 `authenticateMcp + requireAdmin` 校验的管理员。
 * @param allowWrite 为 true 时额外注册写工具（要求服务端开关与令牌 scope 同时满足）。
 * @returns 已注册工具、尚未连接 Transport 的 Server。
 */
export function createMcpServer(admin: AuthUser, allowWrite: boolean): McpServer {
  const server = new McpServer(
    { name: 'sylvie-gallery-api', version: '1.0.0' },
    {
      instructions: [
        '希尔薇图集 API 的 MCP 入口。',
        '工具返回 JSON 文本，统一响应结构为 { code, message, data }。',
        '查询类工具只读；写操作工具需要在服务端设置 MCP_ALLOW_WRITE=true 才会注册。',
        '修改数据后建议再次查询确认结果，所有后台写操作都会写入 admin_op_log。',
      ].join('\n'),
    },
  );

  registerReadTools(server, admin);
  if (allowWrite) {
    registerWriteTools(server, admin);
  }

  return server;
}
