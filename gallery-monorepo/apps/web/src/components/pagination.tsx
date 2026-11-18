'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}

function buildPages(page: number, totalPages: number): Array<number | '...'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const result: Array<number | '...'> = [1];
  if (page > 4) {
    result.push('...');
  }
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let value = start; value <= end; value += 1) {
    result.push(value);
  }
  if (page < totalPages - 3) {
    result.push('...');
  }
  result.push(totalPages);
  return result;
}

export function Pagination({ page, totalPages, onChange, className }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = buildPages(page, totalPages);
  const buttonClass =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-line bg-panel px-3 text-[13px] text-t2 transition hover:border-line2 hover:text-t1 disabled:opacity-35';

  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 pt-7 ${className ?? ''}`}>
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
