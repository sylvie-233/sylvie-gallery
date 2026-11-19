/** 页码项：数字或省略号。 */
export type PageItem = number | '...';

/**
 * 生成页码序列：总数 ≤ 7 时全量展示，否则保留首尾页与当前页相邻两页。
 *
 * 只负责计算，不涉及任何样式；Web 与 Admin 各自用自己的分页外观渲染。
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
