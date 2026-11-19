/**
 * 前台统一图片展示组件。
 *
 * 汇总懒加载、加载态骨架、淡入与失败回落，避免各页面重复实现。
 * 依赖前台主题的 `skeleton`、`cover-fallback` 全局类与 `border-line` token。
 * 内部使用 `useState` / `useEffect`，属于客户端组件；由 web 入口的
 * `"use client"` 横幅保证在 App Router 中可安全引用。
 */
import { useEffect, useState } from 'react';

import { cn } from '@sylvie/utils';

interface CoverImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: string;
  eager?: boolean;
  fit?: 'cover' | 'contain';
}

/**
 * 前台图片展示统一入口：
 * - 原生懒加载（首屏可传 eager）；
 * - 加载中显示 shimmer 骨架，加载完成后淡入；
 * - 外链失败时回落到渐变占位，避免破图。
 *
 * 行为细节：
 * - `src` 变化时会重置为加载态，避免复用节点时短暂显示旧图；
 * - `src` 为空或图片 `onError` 后渲染 `cover-fallback` 渐变块，
 *   优先显示 `fallback` 文本，否则取 `alt` 前两个字符；
 * - `referrerPolicy="no-referrer"` 与禁止拖拽是前台图片的固定策略。
 *
 * @param src 图片地址；空字符串直接进入回落态
 * @param alt 无障碍描述，同时作为回落文本来源
 * @param className 追加到根节点的类名
 * @param fallback 回落态显示的自定义文本
 * @param eager 首屏图片传 `true`，改为立即加载并提升优先级
 * @param fit `cover` 裁切铺满（默认）或 `contain` 完整显示
 */
export function CoverImage({
  src,
  alt,
  className,
  fallback,
  eager = false,
  fit = 'cover',
}: CoverImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    setStatus('loading');
  }, [src]);

  if (!src || status === 'error') {
    return (
      <div className={cn('cover-fallback h-full w-full', className)} aria-label={alt}>
        {fallback ?? alt.slice(0, 2)}
      </div>
    );
  }

  return (
    <span
      className={cn(
        'relative block h-full w-full overflow-hidden',
        fit === 'contain' && 'flex items-center justify-center',
        className,
      )}
      aria-busy={status === 'loading'}
    >
      {status === 'loading' ? (
        <span className="skeleton absolute inset-0 rounded-none" aria-hidden="true" />
      ) : null}
      <img
        src={src}
        alt={alt}
        className={cn(
          'block transition-opacity duration-500 ease-out',
          fit === 'contain' ? 'max-h-full max-w-full object-contain' : 'h-full w-full object-cover',
          status === 'loaded' ? 'opacity-100' : 'opacity-0',
        )}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={eager ? 'high' : 'auto'}
        referrerPolicy="no-referrer"
        draggable={false}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </span>
  );
}
