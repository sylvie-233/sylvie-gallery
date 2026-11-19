import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** MCP 工具统一以 JSON 文本返回，便于 agent 直接解析。 */
export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
  };
}
