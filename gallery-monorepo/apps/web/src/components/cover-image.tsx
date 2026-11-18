'use client';

import { useState } from 'react';

import { cn } from '@sylvie/utils';

interface CoverImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: string;
  eager?: boolean;
  fit?: 'cover' | 'contain';
}

/** 带渐变兜底的封面图，避免外链图片失败时出现破图。 */
export function CoverImage({
  src,
  alt,
  className,
  fallback,
  eager = false,
  fit = 'cover',
}: CoverImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={cn('cover-fallback h-full w-full', className)} aria-label={alt}>
        {fallback ?? alt.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={cn('h-full w-full', fit === 'contain' ? 'object-contain' : 'object-cover', className)}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
