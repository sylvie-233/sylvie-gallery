'use client';

import { usePathname } from 'next/navigation';

/** 路由切换时的顶部细进度线，给页面切换一个轻量的过渡提示。 */
export function RouteProgress() {
  const pathname = usePathname();
  return <div key={pathname} className="route-progress" aria-hidden="true" />;
}
