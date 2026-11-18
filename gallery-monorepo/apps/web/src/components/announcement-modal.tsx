'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import type { AnnouncementDto } from '@sylvie/types';
import { cn, formatDate } from '@sylvie/utils';

interface AnnouncementModalProps {
  announcement: AnnouncementDto | null;
  onClose: () => void;
}

export function AnnouncementModal({ announcement, onClose }: AnnouncementModalProps) {
  useEffect(() => {
    if (!announcement) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [announcement, onClose]);

  if (!announcement) {
    return null;
  }

  const paragraphs = (announcement.content ?? announcement.summary ?? '')
    .split('\n\n')
    .filter(Boolean);

  return createPortal(
    <div className="modal-mask" onClick={onClose} role="presentation">
      <div
        className="modal-card max-w-[660px] p-6 sm:p-7"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {announcement.isTop ? <span className="chip chip-brand">置顶</span> : null}
            <span className="chip chip-gray">{announcement.typeLabel}</span>
            <span className="text-xs text-t3">{formatDate(announcement.publishedAt)}</span>
          </div>
          <button
            type="button"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-t3 transition hover:bg-white/5 hover:text-t1"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <h2 className="text-[20px] font-bold leading-snug">{announcement.title}</h2>
        <div className={cn('mt-4 space-y-3 text-[13.5px] leading-[1.9] text-t2')}>
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
