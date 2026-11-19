import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@sylvie/utils';

interface SectionHeadProps {
  title: string;
  sub?: ReactNode;
  href?: string;
  linkText?: string;
  red?: boolean;
  className?: string;
}

/** 前台分区标题：标题 + 副标题 + 右侧「查看全部」链接。 */
export function SectionHead({
  title,
  sub,
  href,
  linkText = '查看全部',
  red = false,
  className,
}: SectionHeadProps) {
  return (
    <div className={cn('mb-3.5 flex flex-wrap items-center gap-2.5', className)}>
      <h2 className={cn('section-title', red && 'text-brand')}>{title}</h2>
      {sub ? <span className="text-xs text-t3">{sub}</span> : null}
      {href ? (
        <Link href={href} className="ml-auto text-xs text-t3 transition hover:text-brand2">
          {linkText} ›
        </Link>
      ) : null}
    </div>
  );
}
