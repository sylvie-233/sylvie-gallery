/**
 * 分页序列计算：与样式无关的纯函数。
 *
 * Web 与 Admin 的分页组件外观、间距和交互密度不同，但页码算法共用本文件，
 * 以保证两端的省略号位置与首尾页规则一致。
 */

/** 页码项：具体页码数字，或占位省略号。 */
export type PageItem = number | '...';

/**
 * 生成分页页码序列。
 *
 * 规则：
 * - `totalPages ≤ 7` 时返回全部页码；
 * - 否则固定保留首页与末页，并展示当前页前后各一页；
 * - 当前页距首/末页较远时插入 `'...'`。
 *
 * 入参会被向下取整并夹取到合法范围（`page ≥ 1`，`totalPages ≥ 0`），
 * 调用方无需自行清洗。函数只负责计算，不涉及样式，也不产生副作用。
 *
 * @param page 当前页（从 1 开始）
 * @param totalPages 总页数
 */
export function buildPageItems(page: number, totalPages: number): PageItem[] {
  const total = Math.max(0, Math.floor(totalPages));
  const current = Math.min(Math.max(1, Math.floor(page)), Math.max(1, total));

  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const result: PageItem[] = [1];
  if (current > 4) {
    result.push('...');
  }
  for (let value = Math.max(2, current - 1); value <= Math.min(total - 1, current + 1); value += 1) {
    result.push(value);
  }
  if (current < total - 3) {
    result.push('...');
  }
  result.push(total);
  return result;
}
