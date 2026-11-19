import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  items: ToastItem[];
  push: (message: string, type?: ToastType) => void;
  dismiss: (id: number) => void;
}

let sequence = 0;

/** 全局轻提示：可在任意位置调用，无需 Provider 包裹。 */
export const useToastStore = create<ToastState>()((set, get) => ({
  items: [],
  push: (message, type = 'info') => {
    sequence += 1;
    const id = sequence;
    set((state) => ({ items: [...state.items.slice(-2), { id, message, type }] }));
    setTimeout(() => get().dismiss(id), 2800);
  },
  dismiss: (id) =>
    set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));

/** 非 React 场景直接调用。 */
export function toast(message: string, type: ToastType = 'info'): void {
  useToastStore.getState().push(message, type);
}

/** 组件内调用，保持与原有 API 一致。 */
export function useToast(): { toast: (message: string, type?: ToastType) => void } {
  return { toast };
}

/** 轻提示渲染层，挂在根组件一次即可。 */
export function ToastViewport() {
  const items = useToastStore((state) => state.items);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex flex-col items-center gap-2 px-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="fade-up flex max-w-[90vw] items-center gap-2 rounded-xl border border-line2 bg-[#1b1b21] px-4 py-2.5 text-[13px] text-t1 shadow-[0_12px_36px_rgba(0,0,0,.5)]"
        >
          {item.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-400" />
          ) : item.type === 'error' ? (
            <XCircle size={16} className="text-brand2" />
          ) : (
            <Info size={16} className="text-sky-400" />
          )}
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
