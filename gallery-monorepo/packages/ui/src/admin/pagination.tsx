/**
 * 后台分页条。
 *
 * 页码算法来自 common 的 `buildPageItems`，与前台分页一致；外观则是
 * 后台紧凑风格，依赖 `.pager` 全局类与其 `.on` 选中态。总页数 ≤ 1 时
 * 不渲染。注意本组件只返回单行页码按钮，外边距由列表容器负责。
 */
import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { buildPageItems } from '../common/pagination.js';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

/**
 * 后台分页条：紧凑页码按钮，样式由后台 `.pager` 决定。
 *
 * 页码序列用 `useMemo` 缓存；组件受控，翻页只通过 `onChange` 通知调用方。
 *
 * @param page 当前页（从 1 开始）
 * @param totalPages 总页数
 * @param onChange 页码变化回调
 */
export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  const pages = useMemo(() => buildPageItems(page, totalPages), [page, totalPages]);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="pager">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft size={14} />
      </button>
      {pages.map((value, index) =>
        value === '...' ? (
          <span key={`e-${index}`} className="px-1 text-t3">
            …
          </span>
        ) : (
          <button
            key={value}
            type="button"
            className={value === page ? 'on' : ''}
            onClick={() => onChange(value)}
          >
            {value}
          </button>
        ),
      )}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
