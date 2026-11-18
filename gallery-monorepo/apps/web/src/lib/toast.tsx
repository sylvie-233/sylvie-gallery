'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    idRef.current += 1;
    const id = idRef.current;
    setItems((prev) => [...prev.slice(-2), { id, message, type }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 2600);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[74px] z-[200] flex flex-col items-center gap-2 px-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="fade-up flex max-w-[92vw] items-center gap-2 rounded-xl border border-line2 bg-[#1b1b21] px-4 py-2.5 text-[13px] text-t1 shadow-[0_12px_36px_rgba(0,0,0,.5)]"
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
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast 必须在 ToastProvider 内使用');
  }
  return context;
}
