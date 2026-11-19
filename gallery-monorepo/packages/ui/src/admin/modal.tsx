import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { useBodyScrollLock, useNavigationKeys } from '../common/hooks.js';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/** 后台弹窗：Portal 渲染，支持 Esc 关闭与滚动锁定。 */
export function Modal({ open, title, onClose, children, footer, width = 520 }: ModalProps) {
  useBodyScrollLock(open);
  useNavigationKeys({ onEscape: onClose }, open);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="modal-mask" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        style={{ maxWidth: width }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-bold">{title}</h2>
          <button
            type="button"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-t3 transition hover:bg-white/5 hover:text-t1"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={17} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2.5 border-t border-line px-5 py-3.5">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
