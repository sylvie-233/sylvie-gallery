/**
 * 前台品牌 Logo。
 *
 * 依赖 `next/link` 做客户端跳转，因此仅适用于 Next.js 前台；
 * 后台的导航与标题使用 `PageHead`，不复用本组件。视觉依赖
 * `gradient-mark` 全局类与 `text-t1` token。
 */
import Link from 'next/link';

import { cn } from '@sylvie/utils';

interface LogoProps {
  size?: number;
  withText?: boolean;
  className?: string;
  href?: string;
}

/**
 * 前台统一「希」字渐变方块 Logo。
 *
 * 传入 `href` 时外层包裹 `next/link`（默认回首页）；传 `null` 可得到
 * 纯展示版本，用于登录弹窗等不希望跳转的位置。
 *
 * @param size 方块边长（px），默认 32；字号按比例缩放并保证不小于 12
 * @param withText 是否在方块右侧显示「希尔薇图集」文字，默认 `true`
 * @param className 追加到内层内容容器的类名
 * @param href 点击跳转地址；传 `null` 时不渲染链接
 */
export function Logo({ size = 32, withText = true, className, href = '/' }: LogoProps) {
  const content = (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span
        className="gradient-mark flex shrink-0 items-center justify-center rounded-[9px] font-extrabold leading-none text-white"
        style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.5)) }}
        aria-hidden="true"
      >
        希
      </span>
      {withText ? (
        <span className="whitespace-nowrap text-[17.5px] font-extrabold tracking-[0.5px] text-t1">
          希尔薇图集
        </span>
      ) : null}
    </span>
  );

  if (!href) {
    return content;
  }
  return (
    <Link href={href} className="flex items-center" aria-label="希尔薇图集首页">
      {content}
    </Link>
  );
}
