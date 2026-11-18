'use client';

import type { ReactNode } from 'react';
import { LogIn } from 'lucide-react';

import { useAuth } from '@/lib/auth';
import { EmptyState } from './empty-state';

/** 受保护页面：未登录时展示登录引导，不在客户端跳转。 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { initialized, loading, user, openAuth } = useAuth();

  if (!initialized || loading) {
    return (
      <div className="wrap">
        <div className="skeleton h-32 w-full" />
        <div className="skeleton mt-6 h-72 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="wrap">
        <div className="panel">
          <EmptyState
            icon={<LogIn size={22} />}
            title="登录后继续"
            text="登录后可查看个人资料、通知、收藏与购买记录。"
            action={
              <button type="button" className="btn btn-brand" onClick={() => openAuth('login')}>
                登录 / 注册
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
