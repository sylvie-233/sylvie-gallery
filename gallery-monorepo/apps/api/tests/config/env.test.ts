/**
 * 环境变量测试：默认值、类型转换与 CORS 白名单拆分。
 * setup 已写入测试用环境变量，不依赖本地 `.env` 的内容。
 */
import { describe, expect, it } from 'vitest';

import { corsOrigins, env } from '../../src/config/env.js';

describe('env', () => {
  it('读取 setup 注入的必填项', () => {
    expect(env.JWT_SECRET).toBe('test-secret-at-least-16-chars');
    expect(env.JWT_EXPIRES_IN).toBe(3600);
    expect(env.LOG_LEVEL).toBe('silent');
  });

  it('数值字段完成类型转换', () => {
    expect(env.PORT).toBe(3000);
    expect(env.DB_PORT).toBe(3306);
    expect(env.OTEL_METRIC_EXPORT_INTERVAL).toBe(15000);
    expect(env.OTEL_TRACE_SAMPLE_RATIO).toBe(1);
  });

  it('布尔开关统一使用字符串 true / false', () => {
    expect(env.RATE_LIMIT_ENABLED).toBe('true');
    expect(env.OBSERVABILITY_ENABLED).toBe('false');
    expect(env.MCP_ALLOW_WRITE).toBe('false');
  });

  it('S3 与支付开关被转换为布尔值', () => {
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.ALIPAY_MOCK).toBe(true);
  });
});

describe('corsOrigins', () => {
  it('拆分逗号分隔的来源并去除空白与空项', () => {
    expect(corsOrigins).toEqual(['http://localhost:3001', 'http://localhost:8080']);
  });
});
