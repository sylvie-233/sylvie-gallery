/**
 * API 单元测试配置：Node 环境，测试集中在 `tests/`，目录结构镜像 `src/`。
 * 测试只覆盖纯逻辑与中间件编排，不连接 MySQL / Redis / S3 / MQ。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/openapi/models/**',
        'src/routes/**',
        'src/services/**',
        'src/controllers/**',
        'src/jobs/**',
        'src/mq/**',
        'src/db/**',
        'src/sql/admin/**',
      ],
    },
  },
});
