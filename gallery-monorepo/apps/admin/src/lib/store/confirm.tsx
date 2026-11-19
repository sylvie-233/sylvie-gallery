import { AlertTriangle } from 'lucide-react';
import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  text?: string;
  okText?: string;
  cancelText?: string;
}

interface ConfirmState {
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  /** 打开确认弹窗，返回用户选择。 */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** 关闭弹窗并回填结果。 */
  settle: (value: boolean) => void;
}

/** 全局二次确认：以 Promise 形式调用，无需 Provider 包裹。 */
export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  options: null,
  resolve: null,
  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      // 前一个弹窗若仍未关闭，先按取消处理，避免 Promise 悬挂。
      get().resolve?.(false);
      set({ options, resolve });
    }),
  settle: (value) => {
    get().resolve?.(value);
    set({ options: null, resolve: null });
  },
}));

/** 组件内调用，保持与原有 API 一致。 */
export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean> } {
  const confirm = useConfirmStore((state) => state.confirm);
  return { confirm };
}

/** 确认弹窗渲染层，挂在根组件一次即可。 */
export function ConfirmViewport() {
  const options = useConfirmStore((state) => state.options);
  const settle = useConfirmStore((state) => state.settle);

  if (!options) {
    return null;
  }

  return (
    <div className="modal-mask" onClick={() => settle(false)} role="presentation">
      <div
        className="modal-card max-w-[400px] p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-brand/30 bg-brand-dim">
          <AlertTriangle size={22} className="text-brand" />
        </div>
        <h3 className="text-center text-[17px] font-bold">{options.title}</h3>
        {options.text ? (
          <p className="mt-2 whitespace-pre-line text-center text-[13px] leading-relaxed text-t3">
            {options.text}
          </p>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" className="btn btn-line" onClick={() => settle(false)}>
            {options.cancelText ?? '取消'}
          </button>
          <button type="button" className="btn btn-red" onClick={() => settle(true)}>
            {options.okText ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
