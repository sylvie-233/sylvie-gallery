/**
 * 前台空态占位。
 *
 * 用于列表无数据、未登录、搜索无结果等场景。外观依赖前台主题的
 * `border-line` / `bg-panel` token；后台同类组件是 `@sylvie/ui/admin`
 * 中的 `Empty`（使用 `.empty` 全局类），两者不要互相引用。
 */
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  text?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

/**
 * 前台空态：标题 + 说明 + 可选图标与操作。
 *
 * @param title 主标题（必填）
 * @param text 辅助说明，省略时不渲染
 * @param action 操作区节点，通常放登录或重试按钮
 * @param icon 图标节点，会被包裹进圆形底板
 */
export function EmptyState({ title, text, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      {icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-line bg-panel text-t3">
          {icon}
        </div>
      ) : null}
      <p className="text-[15px] font-semibold text-t2">{title}</p>
      {text ? <p className="mt-2 max-w-md text-[13px] leading-relaxed text-t3">{text}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
