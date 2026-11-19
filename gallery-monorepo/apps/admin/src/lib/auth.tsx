import { useCallback, useEffect, useMemo } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';

import type { AdminProfile, AuthResult } from '@sylvie/types';

import { adminFetch, clearAdminToken, storeAdminToken } from './api';
import { useAuthStore } from './store/auth';

interface AdminAuthValue {
  user: AdminProfile | null;
  token: string | null;
  initialized: boolean;
  loading: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<AdminProfile>;
  logout: () => void;
  refreshUser: () => Promise<AdminProfile | null>;
  revalidateAll: () => Promise<void>;
}

/** 让所有后台列表 / 详情查询失效并重新拉取（写操作成功后调用）。 */
export async function revalidateAdminData(): Promise<void> {
  await globalMutate(
    (key) => Array.isArray(key) || (typeof key === 'string' && key.startsWith('/')),
    undefined,
    { revalidate: true },
  );
}

/** 清空 SWR 缓存，避免切换账号后串用上一会话的数据。 */
async function clearAdminCache(): Promise<void> {
  await globalMutate(() => true, undefined, { revalidate: false });
}

/**
 * 会话同步：Zustand 保存登录态，SWR 负责拉取当前管理员资料。
 * - 首屏从 storage 恢复令牌；
 * - 有令牌但无资料时请求 /auth/me；
 * - 令牌失效或接口返回 401 时清空会话与缓存。
 */
export function AdminAuthSync() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);
  const hydrate = useAuthStore((state) => state.hydrate);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    if (!initialized) {
      hydrate();
    }
  }, [initialized, hydrate]);

  const { data, error } = useSWR<AdminProfile>(
    initialized && token && !user ? ['/auth/me', token] : null,
    () => adminFetch<AdminProfile>('/auth/me'),
    { shouldRetryOnError: false },
  );

  useEffect(() => {
    if (data) {
      setUser(data);
    }
  }, [data, setUser]);

  const failSession = useCallback(() => {
    clearAdminToken();
    clearSession();
    void clearAdminCache();
  }, [clearSession]);

  useEffect(() => {
    if (error) {
      failSession();
    }
  }, [error, failSession]);

  useEffect(() => {
    window.addEventListener('sylvie-admin-unauthorized', failSession);
    return () => window.removeEventListener('sylvie-admin-unauthorized', failSession);
  }, [failSession]);

  return null;
}

/** 管理员登录态与操作；页面无需再关心存储细节。 */
export function useAdminAuth(): AdminAuthValue {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);
  const setSession = useAuthStore((state) => state.setSession);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const result = await adminFetch<AuthResult>('/auth/login', {
        method: 'POST',
        body: { email, password },
        skipUnauthorizedEvent: true,
      });
      storeAdminToken(result.token, remember);
      await clearAdminCache();
      setSession(result.token, result.profile as AdminProfile);
      return result.profile as AdminProfile;
    },
    [setSession],
  );

  const logout = useCallback(() => {
    clearAdminToken();
    clearSession();
    void clearAdminCache();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    if (!token) {
      return null;
    }
    const profile = await adminFetch<AdminProfile>('/auth/me');
    setUser(profile);
    await revalidateAdminData();
    return profile;
  }, [token, setUser]);

  return useMemo<AdminAuthValue>(
    () => ({
      user,
      token,
      initialized,
      loading: initialized && Boolean(token) && !user,
      login,
      logout,
      refreshUser,
      revalidateAll: revalidateAdminData,
    }),
    [user, token, initialized, login, logout, refreshUser],
  );
}
