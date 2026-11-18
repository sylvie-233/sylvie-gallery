'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  text?: string;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ ...options, resolve });
    });
  }, []);

  const close = (value: boolean) => {
    state?.resolve(value);
    resolverRef.current = null;
    setState(null);
  };

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state ? (
        <div className="modal-mask" onClick={() => close(false)} role="presentation">
          <div
            className="modal-card max-w-[400px] p-6"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-brand/30 bg-brand-dim">
              <AlertTriangle size={22} className="text-brand" />
            </div>
            <h3 className="text-center text-[17px] font-bold">{state.title}</h3>
            {state.text ? (
              <p className="mt-2 whitespace-pre-line text-center text-[13px] leading-relaxed text-t3">
                {state.text}
              </p>
            ) : null}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" className="btn btn-outline" onClick={() => close(false)}>
                {state.cancelText ?? '取消'}
              </button>
              <button
                type="button"
                className={state.danger === false ? 'btn btn-brand' : 'btn btn-brand'}
                onClick={() => close(true)}
              >
                {state.okText ?? '确认'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm 必须在 ConfirmProvider 内使用');
  }
  return context;
}
