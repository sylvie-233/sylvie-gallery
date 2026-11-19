/**
 * 可观测性装配测试：默认关闭时全部能力退化为 no-op，
 * 不建 span、不记指标、不写 trace 响应头，但业务回调照常执行。
 */
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { observability } from '../../src/observability/index.js';

describe('observability（默认关闭）', () => {
  it('关闭时不启用 SDK', () => {
    expect(observability.enabled).toBe(false);
    expect(observability.getTraceContext()).toBeUndefined();
    expect(observability.traceLogFields()).toEqual({});
  });

  it('start / shutdown 均为空操作', async () => {
    await expect(observability.start()).resolves.toBeUndefined();
    await expect(observability.shutdown()).resolves.toBeUndefined();
  });

  it('中间件放行请求且不写 trace 响应头', async () => {
    const app = new Hono();
    app.use('*', observability.middleware());
    app.get('/x', (c) => c.json({ ok: true }));

    const response = await app.request('/x');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-trace-id')).toBeNull();
    expect(await response.json()).toEqual({ ok: true });
  });

  it('withSpan 照常执行回调并返回结果', async () => {
    const result = await observability.withSpan('demo', async (span) => {
      span.setAttribute('demo', true);
      span.addEvent('started');
      span.setOk();
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('wrapToolHandler 透传结果与异常', async () => {
    await expect(observability.wrapToolHandler('list_albums', async () => 1)).resolves.toBe(1);
    await expect(
      observability.wrapToolHandler('get_album', async () => {
        throw new Error('工具失败');
      }),
    ).rejects.toThrow('工具失败');
  });

  it('自定义指标与手动 HTTP 记录不抛错', () => {
    expect(() => {
      observability.counter('demo.counter').add(1, { kind: 'test' });
      observability.histogram('demo.duration', { unit: 's' }).record(0.1);
      observability.recordHttpRequest({
        method: 'GET',
        route: '/api/albums',
        status: 200,
        durationMs: 12,
      });
    }).not.toThrow();
  });
});
