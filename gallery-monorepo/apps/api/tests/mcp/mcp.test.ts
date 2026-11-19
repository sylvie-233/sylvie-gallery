/**
 * MCP 相关测试：工具统一 JSON 返回结构，以及 `instrumentMcpServer`
 * 对 `registerTool` 的包装（可观测性关闭时应透传结果与异常）。
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';

import { instrumentMcpServer } from '../../src/mcp/instrumentation.js';
import { jsonResult } from '../../src/mcp/result.js';

describe('jsonResult', () => {
  it('把任意值序列化为单个 text content', () => {
    const result = jsonResult({ code: 200, data: { id: 1 } });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: 'text' });
    const text = (result.content[0] as { text: string }).text;
    expect(JSON.parse(text)).toEqual({ code: 200, data: { id: 1 } });
  });

  it('不会二次转义中文与换行', () => {
    const result = jsonResult({ message: '操作成功\n完成' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('操作成功\\n完成');
    expect(JSON.parse(text)).toEqual({ message: '操作成功\n完成' });
  });
});

describe('instrumentMcpServer', () => {
  /** 记录被包装后的 handler，供测试直接调用。 */
  type ToolHandler = (...args: unknown[]) => Promise<unknown>;

  function createFakeServer(): {
    server: McpServer;
    handlers: Map<string, ToolHandler>;
  } {
    const handlers = new Map<string, ToolHandler>();
    const fake = {
      registerTool: vi.fn((name: string, _config: unknown, handler: ToolHandler) => {
        handlers.set(name, handler);
      }),
    };
    return { server: fake as unknown as McpServer, handlers };
  }

  it('包装后仍调用原 registerTool 并透传结果', async () => {
    const { server, handlers } = createFakeServer();
    instrumentMcpServer(server);

    server.registerTool(
      'list_albums',
      { description: '查询图集' },
      (async (input: unknown) => jsonResult({ input })) as never,
    );

    const handler = handlers.get('list_albums');
    expect(handler).toBeTypeOf('function');
    await expect(handler?.({ page: 1 })).resolves.toEqual(jsonResult({ input: { page: 1 } }));
  });

  it('异常会继续向上抛出', async () => {
    const { server, handlers } = createFakeServer();
    instrumentMcpServer(server);

    server.registerTool(
      'get_album',
      {},
      (async () => {
        throw new Error('工具执行失败');
      }) as never,
    );

    await expect(handlers.get('get_album')?.({})).rejects.toThrow('工具执行失败');
  });
});
