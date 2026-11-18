import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { RouteProgress } from '@/components/route-progress';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Providers } from '@/lib/providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '希尔薇图集 · 高清写真每日更新',
    template: '%s · 希尔薇图集',
  },
  description:
    '希尔薇图集：日系、清新、国风等风格写真图集，注册会员可预览前 3 张并用解锁积分查看完整图集，付费会员全站畅看与下载。',
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0b0e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <RouteProgress />
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
