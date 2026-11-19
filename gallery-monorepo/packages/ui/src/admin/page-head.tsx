/**
 * 后台页面标题行。
 *
 * 依赖后台全局类 `.page-head`（含其下的 `h1` 与 `.sub` 样式）；
 * 右侧操作区通过 flex 撑开，通常放「新建」等主按钮。
 * 前台标题使用 `SectionHead`，两者不合并。
 */
import type { ReactNode } from 'react';

interface PageHeadProps {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}

/**
 * 后台页面标题行：标题 + 计数副标题 + 右侧主操作。
 *
 * @param title 页面标题
 * @param sub 标题右侧的次要信息（计数等），省略时不渲染
 * @param children 右侧操作区节点，可放多个按钮
 */
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
