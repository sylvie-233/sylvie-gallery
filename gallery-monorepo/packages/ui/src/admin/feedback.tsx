import type { ReactNode } from 'react';

import { cn } from '@sylvie/utils';

/** 后台空态。 */
export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {text ?? null}
    </div>
  );
}

/** 列表加载骨架。 */
export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-lg border border-line bg-panel2" />
      ))}
    </div>
  );
}

/** 列表加载失败提示。 */
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

/** 结果计数文案。 */
export function ResultCount({ children }: { children: ReactNode }) {
  return <span className={cn('text-[12px] text-t3')}>{children}</span>;
}
