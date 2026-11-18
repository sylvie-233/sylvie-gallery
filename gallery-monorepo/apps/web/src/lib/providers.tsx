'use client';

import type { ReactNode } from 'react';

import { AuthModal } from '@/components/auth-modal';
import { AuthProvider } from './auth';
import { ConfirmProvider } from './confirm';
import { ToastProvider } from './toast';

/** 全局 Provider：提示、确认弹窗、登录态与登录弹窗。 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          {children}
          <AuthModal />
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
