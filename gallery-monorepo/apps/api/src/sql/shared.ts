/** 一条可直接交给 dbClient / queryOn 的参数化 SQL。 */
export interface SqlStatement {
  sql: string;
  params: unknown[];
}

/** 动态 WHERE 条件片断，供列表类语句复用。 */
export interface SqlFragment {
  sql: string;
  params: unknown[];
}

/** 生成占位符列表：3 → "?, ?, ?"。 */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/** 生成 LIKE 模式，转义用户输入中的通配符。 */
export function likePattern(keyword: string): string {
  return `%${keyword.replace(/[%_\\]/g, '\\$&')}%`;
}
