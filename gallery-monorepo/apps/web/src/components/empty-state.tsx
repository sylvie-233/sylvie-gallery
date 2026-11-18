import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  text?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

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
