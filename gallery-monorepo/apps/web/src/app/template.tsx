import type { ReactNode } from 'react';

/** App Router 的 template 会在每次路由切换时重新挂载，用于播放页面进入动画。 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
