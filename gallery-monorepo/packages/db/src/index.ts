/**
 * `@sylvie/db` 包入口：导出数据库客户端、事务辅助函数、全部 Drizzle schema，
 * 以及业务层常用的 Drizzle 查询算子（`eq` / `and` / `desc` 等）。
 */
// 先加载 mysql2 类型补丁，保证导出的 Pool / PoolConnection 类型携带 query 方法。
import './mysql2-augment.js';

export * from './client.js';
export * from './schema/index.js';
export { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
