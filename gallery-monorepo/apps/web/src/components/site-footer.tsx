'use client';

import Link from 'next/link';

import { useBootstrap } from '@/lib/hooks';
import { Logo } from '@sylvie/ui/web';

export function SiteFooter() {
  const { data } = useBootstrap();
  const copyright = data?.config['site.copyright'] ?? '© 2020-2026 希尔薇图集. All rights reserved.';
  const icp = data?.config['site.icp_no'] ?? '';
  const links = data?.friendLinks ?? [];

  return (
    <footer className="border-t border-line bg-[rgba(11,11,14,.6)]">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-5 py-5 text-xs text-t3 sm:flex-row sm:items-center">
        <Logo size={24} href="/" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:ml-4">
          <span className="text-t3">友情链接</span>
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-panel2 px-3 py-1 transition hover:border-brand/40 hover:text-t1"
            >
              <b className="text-[12px] font-semibold text-t2 group-hover:text-brand2">{link.name}</b>
              {link.slogan ? <span className="text-[11px] text-t3">· {link.slogan}</span> : null}
            </a>
          ))}
          <Link
            href="/membership"
            className="inline-flex items-center gap-1 rounded-full border border-line bg-panel2 px-3 py-1 transition hover:border-brand/40 hover:text-t1"
          >
            <b className="text-[12px] font-semibold text-t2">希尔薇图集</b>
            <span className="text-[11px] text-t3">· 高清写真 每日更新</span>
          </Link>
        </div>
        <div className="flex flex-col gap-1 sm:ml-auto sm:items-end">
          <span>{copyright}</span>
          {icp ? <span className="text-[11px] text-t3">{icp}</span> : null}
        </div>
      </div>
    </footer>
  );
}
