'use client';

import useSWR from 'swr';

import type { SiteBootstrap } from '@sylvie/types';

import { apiFetch } from './api';
import { useAuth } from './auth';

/** 首页 / 页脚共用站点聚合数据；登录态变化时自动重新请求。 */
export function useBootstrap() {
  const { token } = useAuth();
  return useSWR<SiteBootstrap>(['/site/bootstrap', token ?? 'guest'], () =>
    apiFetch<SiteBootstrap>('/api/site/bootstrap'),
  );
}
