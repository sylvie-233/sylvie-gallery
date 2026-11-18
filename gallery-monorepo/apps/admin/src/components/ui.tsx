import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

import { cn } from '@sylvie/utils';

import { TIME_QUICK_LABELS, quickToRange, type TimeQuick, type TimeRange } from '@/lib/date';

export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {sub ? <span className="sub">{sub}</span> : null}
      <div className="flex-1" />
      {children}
    </div>
  );
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ value: T; label: string; badge?: number }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={value === item.value ? 'on' : ''}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.badge !== undefined && item.badge > 0 ? (
            <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
              {item.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  onSearch,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  placeholder: string;
}) {
  return (
    <form
      className="seg"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-t3"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pl-9"
          style={{ minWidth: 210 }}
        />
      </div>
      <button type="submit" className="btn btn-line btn-sm">
        搜索
      </button>
    </form>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const pages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const result: Array<number | '...'> = [1];
    if (page > 4) result.push('...');
    for (
      let value = Math.max(2, page - 1);
      value <= Math.min(totalPages - 1, page + 1);
      value += 1
    ) {
      result.push(value);
    }
    if (page < totalPages - 3) result.push('...');
    result.push(totalPages);
    return result;
  }, [page, totalPages]);

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

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-mask" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        style={{ maxWidth: width }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-bold">{title}</h2>
          <button
            type="button"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-t3 transition hover:bg-white/5 hover:text-t1"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={17} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2.5 border-t border-line px-5 py-3.5">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {text ?? null}
    </div>
  );
}

export type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'brand';

export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function AlbumStatusBadge({ status }: { status: 'draft' | 'published' | 'offline' }) {
  if (status === 'published') return <Badge tone="green">已发布</Badge>;
  if (status === 'draft') return <Badge tone="gray">草稿</Badge>;
  return <Badge tone="red">已下架</Badge>;
}

export function AvatarBox({
  name,
  initial,
  color,
  avatarUrl,
  size = 36,
  rounded = 8,
}: {
  name: string;
  initial?: string;
  color?: string;
  avatarUrl?: string | null;
  size?: number;
  rounded?: number;
}) {
  const background = `linear-gradient(135deg, ${color ?? '#3a3a44'}, ${color ?? '#3a3a44'}99)`;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/10 font-bold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        background,
        fontSize: size * 0.36,
      }}
      title={name}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        initial || name.slice(0, 1)
      )}
    </span>
  );
}

export function TimeRangePicker({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}) {
  const quickItems: TimeQuick[] = ['all', 'today', '7', '30', 'custom'];
  const setQuick = (quick: TimeQuick) => {
    if (quick === 'custom') {
      onChange({ quick, from: value.from, to: value.to });
      return;
    }
    onChange({ quick, ...quickToRange(quick) });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="tabs">
        {quickItems.map((quick) => (
          <button
            key={quick}
            type="button"
            className={value.quick === quick ? 'on' : ''}
            onClick={() => setQuick(quick)}
          >
            {TIME_QUICK_LABELS[quick]}
          </button>
        ))}
      </div>
      {value.quick === 'custom' ? (
        <div className="flex items-center gap-2 text-[12px] text-t3">
          <input
            type="date"
            value={value.from}
            onChange={(event) => onChange({ ...value, quick: 'custom', from: event.target.value })}
            className="h-9"
          />
          <span>至</span>
          <input
            type="date"
            value={value.to}
            onChange={(event) => onChange({ ...value, quick: 'custom', to: event.target.value })}
            className="h-9"
          />
        </div>
      ) : null}
    </div>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-lg border border-line bg-panel2" />
      ))}
    </div>
  );
}

export function PageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-10 text-center">
      <p className="text-t2">{message}</p>
      <button type="button" className="btn btn-line mt-4" onClick={onRetry}>
        重新加载
      </button>
    </div>
  );
}

export function ResultCount({ children }: { children: ReactNode }) {
  return <span className={cn('text-[12px] text-t3')}>{children}</span>;
}
