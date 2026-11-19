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
