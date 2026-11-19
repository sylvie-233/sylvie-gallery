import type { ReactNode } from 'react';

interface PageHeadProps {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}

/** 后台页面标题行：标题 + 计数副标题 + 右侧主操作。 */
export function PageHead({ title, sub, children }: PageHeadProps) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {sub ? <span className="sub">{sub}</span> : null}
      <div className="flex-1" />
      {children}
    </div>
  );
}
