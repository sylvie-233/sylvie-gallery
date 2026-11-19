/**
 * 前台 SQL 构建层共享基础类型与工具。
 * 各 `*.sql.ts` 统一以 `{ sql, params }` 返回参数化语句，禁止拼接用户输入；
 * 这里提供占位符生成与 LIKE 通配符转义，供列表 / 批量查询复用。
 */

/** 一条可直接交给 dbClient / queryOn 的参数化 SQL。 */
export interface SqlStatement {
  sql: string;
  params: unknown[];
}

/** 动态 WHERE 条件片断，供列表类语句复用（由各 filter 函数按条件拼装参数）。 */
export interface SqlFragment {
  sql: string;
  params: unknown[];
}

/**
 * 生成 IN 子句占位符列表，例如 3 → "?, ?, ?"。
 * 调用方需保证 `count` 来自数组长度且至少为 1。
 */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/**
 * 生成 LIKE 模式，转义用户输入中的 `%`、`_`、`\` 通配符，
 * 避免关键词被当作模式匹配；需配合 SQL 中的默认转义符使用。
 */
export function likePattern(keyword: string): string {
  return `%${keyword.replace(/[%_\\]/g, '\\$&')}%`;
}
