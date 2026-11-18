import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';

import type { AdminProfile, AuthResult } from '@sylvie/types';

import {
  adminFetch,
  clearAdminToken,
  getAdminToken,
  storeAdminToken,
} from './api';

interface AdminAuthValue {
  user: AdminProfile | null;
  token: string | null;
  initialized: boolean;
  loading: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<AdminProfile>;
  logout: () => void;
  refreshUser: () => Promise<AdminProfile | null | undefined>;
  revalidateAll: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export async function revalidateAdminData(): Promise<void> {
  await globalMutate(
    (key) => Array.isArray(key) || (typeof key === 'string' && key.startsWith('/')),
    undefined,
    { revalidate: true },
  );
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [snapshot, setSnapshot] = useState<AdminProfile | null>(null);

  useEffect(() => {
    setToken(getAdminToken());
    setInitialized(true);
  }, []);

  const { data, error, isLoading, mutate } = useSWR<AdminProfile>(
    initialized && token ? ['/auth/me', token] : null,
    () => adminFetch<AdminProfile>('/auth/me'),
    { shouldRetryOnError: false },
  );

  useEffect(() => {
    if (data) {
      setSnapshot(null);
    }
  }, [data]);

  useEffect(() => {
    if (error) {
      clearAdminToken();
      setToken(null);
      setSnapshot(null);
    }
  }, [error]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearAdminToken();
      setToken(null);
      setSnapshot(null);
    };
    window.addEventListener('sylvie-admin-unauthorized', onUnauthorized);
    return () => window.removeEventListener('sylvie-admin-unauthorized', onUnauthorized);
  }, []);

  const user = snapshot ?? data ?? null;

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      const result = await adminFetch<AuthResult>('/auth/login', {
        method: 'POST',
        body: { email, password },
        skipUnauthorizedEvent: true,
      });
      storeAdminToken(result.token, remember);
      setToken(result.token);
      setSnapshot(result.profile as AdminProfile);
      void revalidateAdminData();
      return result.profile as AdminProfile;
    },
    [],
  );

  const logout = useCallback(() => {
    clearAdminToken();
    setToken(null);
    setSnapshot(null);
    void mutate(undefined, { revalidate: false });
    void revalidateAdminData();
  }, [mutate]);

  const refreshUser = useCallback(() => mutate(), [mutate]);

  const value = useMemo<AdminAuthValue>(
    () => ({
      user,
      token,
      initialized,
      loading: initialized && Boolean(token) && isLoading,
      login,
      logout,
      refreshUser,
      revalidateAll: revalidateAdminData,
    }),
    [user, token, initialized, isLoading, login, logout, refreshUser],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth 必须在 AdminAuthProvider 内使用');
  }
  return context;
}
