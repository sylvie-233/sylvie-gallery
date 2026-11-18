import type { ReactNode } from 'react';

import { AdminAuthProvider } from './auth';
import { ConfirmProvider } from './confirm';
import { ToastProvider } from './toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
