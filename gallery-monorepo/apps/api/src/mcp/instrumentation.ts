/**
 * MCP 工具埋点：包装 `registerTool`，为每次工具调用创建 span，
 * 并记录调用次数、失败次数与耗时指标。对现有工具注册代码零侵入。
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { observability } from '../observability/index.js';

/**
 * 给 MCP Server 安装工具埋点。
 *
 * 必须在 `registerReadTools` / `registerWriteTools` 之前调用，
 * 包装后的 `registerTool` 会为每个工具自动套上 `wrapToolHandler`。
 */
export function instrumentMcpServer(server: McpServer): void {
  type RegisterTool = McpServer['registerTool'];

  const registerTool = server.registerTool.bind(server) as unknown as (
    name: string,
    config: unknown,
    handler: (...args: unknown[]) => unknown,
  ) => unknown;

  server.registerTool = ((
    name: string,
    config: unknown,
    handler: (...args: unknown[]) => unknown,
  ) => {
    const tracedHandler = (...args: unknown[]) =>
      observability.wrapToolHandler(name, () => handler(...args));

    return registerTool(name, config, tracedHandler);
  }) as unknown as RegisterTool;
}
