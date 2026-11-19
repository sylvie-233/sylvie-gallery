import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { buildPageItems } from '../common/pagination.js';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

/** 后台分页条：紧凑页码按钮，样式由后台 `.pager` 决定。 */
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
