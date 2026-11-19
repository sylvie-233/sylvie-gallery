/**
 * 后台弹窗。
 *
 * 通过 `createPortal` 挂到 `document.body`，避免被表格/侧栏的
 * `overflow` 裁切；打开时用 `useBodyScrollLock` 锁定滚动，并监听 Esc
 * 关闭。样式完全由后台全局类 `.modal-mask` / `.modal-card` 决定，
 * 与前台弹窗（应用内自行实现）不是同一套。
 *
 * 注意：`closable` 为 `false` 时关闭按钮隐藏，遮罩点击与 Esc 均不生效，
 * 适合提交中、强制确认等不可中断的场景；此时仍需由调用方在适当时机
 * 调用 `onClose`。组件受控，`open=false` 时不渲染任何 DOM。
 */
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
  /** 为 false 时隐藏关闭按钮，并禁用遮罩点击与 Esc 关闭（如提交中）。 */
  closable?: boolean;
}

/**
 * 后台弹窗：Portal 渲染，支持 Esc 关闭与滚动锁定。
 *
 * @param open 是否显示；`false` 时返回 `null`
 * @param title 标题，同时作为对话框的 `aria-label`
 * @param onClose 关闭回调（关闭按钮、遮罩点击、Esc）
 * @param children 弹窗主体内容
 * @param footer 底部操作区，省略时不渲染分隔线与容器
 * @param width 对话框最大宽度（px），默认 520
 * @param closable 为 `false` 时隐藏关闭按钮，并禁用遮罩点击与 Esc 关闭（如提交中）
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 520,
  closable = true,
}: ModalProps) {
  useBodyScrollLock(open);
  useNavigationKeys({ onEscape: closable ? onClose : undefined }, open);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="modal-mask" onClick={closable ? onClose : undefined} role="presentation">
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
          {closable ? (
            <button
              type="button"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-t3 transition hover:bg-white/5 hover:text-t1"
              onClick={onClose}
              aria-label="关闭"
            >
              <X size={17} />
            </button>
          ) : null}
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
