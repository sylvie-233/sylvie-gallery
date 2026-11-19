/**
 * 数据库实例装配：按环境变量创建应用级连接池，
 * 并透传 `@sylvie/db` 的类型与查询工具。
 */
import { DatabaseClient } from '@sylvie/db';

import { env } from '../config/env.js';

/** 应用级数据库实例：连接参数来自环境变量。 */
export const dbClient = new DatabaseClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_CONNECTION_LIMIT,
});

/**
 * 显式重导出业务层用到的 `@sylvie/db` 成员。
 * 不使用 `export *`：esbuild 打包时无法从外部包的星号重导出中解析具名导入。
 */
export { executeOn, queryOn, queryOneOn } from '@sylvie/db';
export type { TransactionConnection } from '@sylvie/db';
