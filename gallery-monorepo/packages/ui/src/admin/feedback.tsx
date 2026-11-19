/**
 * 后台列表的反馈类组件：空态、加载骨架、加载失败与结果计数。
 *
 * 与前台 `EmptyState` / 骨架屏的视觉命名空间不同：这里使用后台的
 * `.empty`、`.btn` / `.btn-line` 全局类以及 `border-line` / `bg-panel2` /
 * `text-t2` 等 token，请勿在 Web 中引入。
 */
import type { ReactNode } from 'react';

import { cn } from '@sylvie/utils';

/**
 * 后台空态。
 *
 * @param title 主文案，加粗显示
 * @param text 补充说明，省略时不渲染
 */
export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {text ?? null}
    </div>
  );
}

/**
 * 列表加载骨架：等高脉冲行占位。
 *
 * @param rows 行数，默认 4
 */
export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-lg border border-line bg-panel2" />
      ))}
    </div>
  );
}

/**
 * 列表加载失败提示：错误文案 + 重新加载按钮。
 *
 * `onRetry` 由调用方接入 SWR 的 `mutate` 等重试逻辑。
 *
 * @param message 错误文案
 * @param onRetry 点击「重新加载」时触发
 */
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

/**
 * 结果计数文案：统一列表右下角「共 N 条」等次要文字的字号与颜色。
 *
 * @param children 计数文案
 */
export function ResultCount({ children }: { children: ReactNode }) {
  return <span className={cn('text-[12px] text-t3')}>{children}</span>;
}
