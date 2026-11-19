/**
 * 前台分页条。
 *
 * 页码序列来自 common 的 `buildPageItems`，与后台分页共享算法；
 * 外观则是前台专属：胶囊按钮、`border-line` / `bg-panel` / `bg-brand`
 * token 与居中布局。后台对应组件使用 `.pager` 全局类，不可混用。
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@sylvie/utils';

import { buildPageItems } from '../common/pagination.js';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}

/**
 * 前台分页：胶囊按钮 + 品牌色当前页。
 *
 * 总页数 ≤ 1 时不渲染任何内容；上一页/下一页在边界处禁用。
 * 组件受控：自身不保存页码，翻页时回调 `onChange`。
 *
 * @param page 当前页（从 1 开始）
 * @param totalPages 总页数
 * @param onChange 页码变化回调，由调用方负责更新状态与请求数据
 * @param className 追加到根节点的类名
 */
export function Pagination({ page, totalPages, onChange, className }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = buildPageItems(page, totalPages);
  const buttonClass =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-line bg-panel px-3 text-[13px] text-t2 transition hover:border-line2 hover:text-t1 disabled:opacity-35';

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-2 pt-7', className)}>
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="上一页"
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((value, index) =>
        value === '...' ? (
          <span key={`ellipsis-${index}`} className="px-1 text-t3">
            …
          </span>
        ) : (
          <button
            key={value}
            type="button"
            className={
              value === page
                ? 'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-brand bg-brand px-3 text-[13px] font-semibold text-white'
                : buttonClass
            }
            onClick={() => onChange(value)}
          >
            {value}
          </button>
        ),
      )}
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="下一页"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
