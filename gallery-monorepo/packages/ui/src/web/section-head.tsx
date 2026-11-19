/**
 * 前台分区标题行。
 *
 * 用于首页、列表页各内容区块的标题 + 副标题 + 右侧「查看全部」入口。
 * 依赖 `next/link`，仅适用于 Next.js 前台；视觉依赖 `section-title`
 * 全局类与 `text-brand` / `text-t3` / `text-brand2` token。
 */
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

/**
 * 前台分区标题：标题 + 副标题 + 右侧「查看全部」链接。
 *
 * 未传 `href` 时不渲染右侧链接；副标题可以传数字、计数等任意节点。
 *
 * @param title 区块标题（必填）
 * @param sub 标题右侧的副标题节点
 * @param href 「查看全部」跳转地址，省略则不显示链接
 * @param linkText 链接文案，默认「查看全部」
 * @param red 是否用品牌色强调标题，默认 `false`
 * @param className 追加到根节点的类名
 */
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
