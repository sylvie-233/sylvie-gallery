import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, Star, X } from 'lucide-react';

import type { AdminMediaInput } from '@sylvie/types';

export function AdminLightbox({
  images,
  index,
  coverUrl,
  onIndexChange,
  onClose,
}: {
  images: AdminMediaInput[];
  index: number;
  coverUrl?: string | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const current = images[index];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      if (event.key === 'ArrowRight' && index < images.length - 1) onIndexChange(index + 1);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, images.length, onClose, onIndexChange]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-[rgba(6,6,8,.94)] backdrop-blur-sm">
      <div className="flex items-center gap-3 px-5 py-4 text-t2">
        <span className="rounded-full bg-white/10 px-3 py-1 text-[12px] tabular-nums">
          第 {index + 1} / {images.length} 张
        </span>
        {coverUrl && current.url === coverUrl ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-white">
            <Star size={11} fill="currentColor" /> 封面
          </span>
        ) : null}
        <span className="text-[11px] text-t3">← → 切换 · Esc 关闭</span>
        <button
          type="button"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label="关闭"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16">
        {index > 0 ? (
          <button
            type="button"
            className="absolute left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 transition hover:bg-brand hover:text-white"
            onClick={() => onIndexChange(index - 1)}
            aria-label="上一张"
          >
            <ChevronLeft size={22} />
          </button>
        ) : null}
        <img
          src={current.url}
          alt={`第 ${index + 1} 张`}
          className="max-h-full max-w-[min(94vw,1320px)] rounded-lg border border-white/10 object-contain"
          style={{ maxHeight: 'min(80vh, 840px)' }}
        />
        {index < images.length - 1 ? (
          <button
            type="button"
            className="absolute right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 transition hover:bg-brand hover:text-white"
            onClick={() => onIndexChange(index + 1)}
            aria-label="下一张"
          >
            <ChevronRight size={22} />
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2 overflow-x-auto px-5 py-4">
        {images.map((image, imageIndex) => (
          <button
            key={`${image.url}-${imageIndex}`}
            type="button"
            className={`relative h-14 w-11 shrink-0 overflow-hidden rounded-md border transition ${
              imageIndex === index
                ? 'border-brand opacity-100'
                : 'border-white/10 opacity-55 hover:opacity-90'
            }`}
            onClick={() => onIndexChange(imageIndex)}
          >
            <img
              src={image.thumbUrl ?? image.url}
              alt=""
              className="h-full w-full object-cover"
            />
            {coverUrl && image.url === coverUrl ? (
              <span className="absolute right-0.5 top-0.5 rounded bg-brand p-0.5 text-white">
                <Star size={8} fill="currentColor" />
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
