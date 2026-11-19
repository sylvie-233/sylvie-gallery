import { create } from 'zustand';

import type { AdminProfile } from '@sylvie/types';

import { getAdminToken } from '../api';

interface AuthState {
  /** 当前管理员令牌；未登录为 null。 */
  token: string | null;
  /** 当前管理员资料；令牌有效但资料尚未拉取时为 null。 */
  user: AdminProfile | null;
  /** 是否已完成本地登录态读取（避免首屏误判为未登录）。 */
  initialized: boolean;
  /** 从 localStorage / sessionStorage 恢复登录态。 */
  hydrate: () => void;
  /** 登录成功或资料刷新后写入会话。 */
  setSession: (token: string, user: AdminProfile) => void;
  /** 仅更新管理员资料。 */
  setUser: (user: AdminProfile) => void;
  /** 退出登录或令牌失效。 */
  clearSession: () => void;
}

/** 后台登录态：唯一数据源，持久化字符串仍由 lib/api.ts 负责读写。 */
export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  initialized: false,
  hydrate: () => set({ token: getAdminToken(), initialized: true }),
  setSession: (token, user) => set({ token, user, initialized: true }),
  setUser: (user) => set({ user }),
  clearSession: () => set({ token: null, user: null }),
}));
