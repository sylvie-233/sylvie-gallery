'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';

import type { AuthResult, UserProfile } from '@sylvie/types';

import { ApiError, apiFetch, clearStoredToken, getStoredToken, storeToken } from './api';

type AuthMode = 'login' | 'register';

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  initialized: boolean;
  loading: boolean;
  authOpen: boolean;
  authMode: AuthMode;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  setAuthMode: (mode: AuthMode) => void;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (input: {
    nickname: string;
    email: string;
    password: string;
    code: string;
  }) => Promise<UserProfile>;
  logout: () => void;
  refreshUser: () => Promise<UserProfile | null | undefined>;
  setProfile: (profile: UserProfile) => void;
  requireAuth: (mode?: AuthMode) => boolean;
  revalidateAll: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** 登录 / 收藏 / 订阅等操作后，让所有页面数据重新拉取。 */
export async function revalidateAll(): Promise<void> {
  await globalMutate(
    (key) => Array.isArray(key) || (typeof key === 'string' && key.startsWith('/')),
    undefined,
    { revalidate: true },
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [snapshot, setSnapshot] = useState<UserProfile | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  useEffect(() => {
    setToken(getStoredToken());
    setInitialized(true);
  }, []);

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<UserProfile>(initialized && token ? ['/auth/me', token] : null, () =>
    apiFetch<UserProfile>('/api/auth/me'),
  );

  useEffect(() => {
    if (data) {
      setSnapshot(null);
    }
  }, [data]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      clearStoredToken();
      setToken(null);
      setSnapshot(null);
    }
  }, [error]);

  const user = snapshot ?? data ?? null;

  const openAuth = useCallback((mode: AuthMode = 'login') => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const applyAuth = useCallback(
    async (result: AuthResult) => {
      storeToken(result.token);
      setToken(result.token);
      setSnapshot(result.profile);
      setAuthOpen(false);
      await mutate(result.profile, { revalidate: false });
      void revalidateAll();
      return result.profile;
    },
    [mutate],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiFetch<AuthResult>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      return applyAuth(result);
    },
    [applyAuth],
  );

  const register = useCallback(
    async (input: { nickname: string; email: string; password: string; code: string }) => {
      const result = await apiFetch<AuthResult>('/api/auth/register', {
        method: 'POST',
        body: input,
      });
      return applyAuth(result);
    },
    [applyAuth],
  );

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setSnapshot(null);
    setAuthOpen(false);
    void mutate(undefined, { revalidate: false });
    void revalidateAll();
  }, [mutate]);

  const refreshUser = useCallback(async () => {
    return mutate();
  }, [mutate]);

  const setProfile = useCallback(
    (profile: UserProfile) => {
      setSnapshot(profile);
      void mutate(profile, { revalidate: false });
    },
    [mutate],
  );

  const requireAuth = useCallback(
    (mode: AuthMode = 'login') => {
      if (user) {
        return true;
      }
      openAuth(mode);
      return false;
    },
    [openAuth, user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      initialized,
      loading: initialized && Boolean(token) && isLoading,
      authOpen,
      authMode,
      openAuth,
      closeAuth,
      setAuthMode,
      login,
      register,
      logout,
      refreshUser,
      setProfile,
      requireAuth,
      revalidateAll,
    }),
    [
      user,
      token,
      initialized,
      isLoading,
      authOpen,
      authMode,
      openAuth,
      closeAuth,
      login,
      register,
      logout,
      refreshUser,
      setProfile,
      requireAuth,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }
  return context;
}
