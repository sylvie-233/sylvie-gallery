'use client';

import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import type { AlbumImageDto } from '@sylvie/types';
import { cn } from '@sylvie/utils';

import { CoverImage } from './cover-image';

interface LightboxProps {
  images: AlbumImageDto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** 图集大图预览：支持键盘左右切换、Esc 关闭与缩略图定位。 */
export function Lightbox({ images, index, onIndexChange, onClose }: LightboxProps) {
  const current = images[index];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        onIndexChange(index - 1);
      } else if (event.key === 'ArrowRight' && index < images.length - 1) {
        onIndexChange(index + 1);
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [images.length, index, onClose, onIndexChange]);

  if (!current) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-[rgba(6,6,8,.94)] backdrop-blur-sm">
      <div className="flex items-center justify-between px-5 py-4 text-t2">
        <span className="text-sm tabular-nums">
          {index + 1} / {images.length}
        </span>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label="关闭"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14">
        {index > 0 ? (
          <button
            type="button"
            className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 transition hover:bg-white/10 hover:text-white"
            onClick={() => onIndexChange(index - 1)}
            aria-label="上一张"
          >
            <ChevronLeft size={22} />
          </button>
        ) : null}

        <div className="flex h-full w-full max-w-[min(100%,1000px)] items-center justify-center">
          <CoverImage
            src={current.url}
            alt={`图片 ${index + 1}`}
            fit="contain"
            eager
            fallback="希"
            className="max-h-full max-w-full"
          />
        </div>

        {index < images.length - 1 ? (
          <button
            type="button"
            className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 transition hover:bg-white/10 hover:text-white"
            onClick={() => onIndexChange(index + 1)}
            aria-label="下一张"
          >
            <ChevronRight size={22} />
          </button>
        ) : null}
      </div>

      <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-5 py-4">
        {images.map((image, imageIndex) => (
          <button
            key={image.id}
            type="button"
            className={cn(
              'h-14 w-11 shrink-0 overflow-hidden rounded-md border transition',
              imageIndex === index
                ? 'border-brand opacity-100'
                : 'border-white/10 opacity-55 hover:opacity-90',
            )}
            onClick={() => onIndexChange(imageIndex)}
            aria-label={`查看第 ${imageIndex + 1} 张`}
          >
            <CoverImage
              src={image.thumbUrl ?? image.url}
              alt=""
              eager={imageIndex === index}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
