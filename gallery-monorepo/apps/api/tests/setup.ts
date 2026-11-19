/**
 * 测试环境变量：在加载 `config/env.ts` 之前写入，保证不依赖本地 `.env`。
 * 这些值只影响单元测试，真实运行时仍以 `.env` / compose 注入为准。
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-at-least-16-chars';
process.env.JWT_EXPIRES_IN = '3600';
process.env.CORS_ORIGIN = 'http://localhost:3001, http://localhost:8080,,';
// 测试中静默日志，避免错误处理等用例刷屏。
process.env.LOG_LEVEL = 'silent';
process.env.LOG_PRETTY = 'false';
process.env.RATE_LIMIT_ENABLED = 'true';
// 默认关闭可观测性，需要时在用例内单独构造实例。
process.env.OBSERVABILITY_ENABLED = 'false';
