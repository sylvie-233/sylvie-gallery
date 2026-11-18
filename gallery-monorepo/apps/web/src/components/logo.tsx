import Link from 'next/link';

import { cn } from '@sylvie/utils';

interface LogoProps {
  size?: number;
  withText?: boolean;
  className?: string;
  href?: string;
}

/** 全站统一「希」字渐变方块 Logo。 */
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
