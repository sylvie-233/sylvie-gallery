'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Crown,
  Heart,
  Home,
  Images,
  LayoutGrid,
  LogOut,
  Receipt,
  Search,
  Shield,
  Tags,
  User,
} from 'lucide-react';

import { ROLE_LABELS } from '@sylvie/types';
import { cn } from '@sylvie/utils';
import { Avatar, Logo } from '@sylvie/ui/web';

import { useAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';

const NAV_ITEMS = [
  { href: '/', label: '首页', icon: Home },
  { href: '/albums', label: '图集', icon: Images },
  { href: '/waterfall', label: '瀑布流', icon: LayoutGrid },
  { href: '/tags', label: '标签', icon: Tags },
  { href: '/membership', label: '会员', icon: Crown },
  { href: '/announcements', label: '公告', icon: Bell },
];

function roleBadgeClass(role: string): string {
  if (role === 'vip') {
    return 'text-[#ffd777] bg-[rgba(255,215,119,.14)]';
  }
  if (role === 'admin') {
    return 'text-[#8fa6ff] bg-[rgba(122,150,255,.14)]';
  }
  return 'text-t2 bg-white/[0.07]';
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { initialized, user, openAuth, logout } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileCompact, setMobileCompact] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setMobileCompact(false);
  }, [pathname]);

  // 移动端滚动后收起导航，只保留粘性搜索框。
  // 收起会让头部高度减少约 100px，浏览器滚动锚定会同步回退 scrollY；
  // 因此：
  // 1. 收起阈值取大于「头部高度 + 回退距离」，避免回退后落在顶部附近；
  // 2. 只在真正回到顶部（scrollY <= 0）时展开。
  // 否则回退后的 scrollY 会再次满足展开条件，造成头部持续闪烁。
  useEffect(() => {
    let ticking = false;

    const update = () => {
      ticking = false;
      if (window.innerWidth >= 1024) {
        setMobileCompact(false);
        return;
      }

      const current = window.scrollY;
      setMobileCompact((compact) => {
        if (!compact && current > 160) {
          return true;
        }
        if (compact && current <= 0) {
          return false;
        }
        return compact;
      });
    };

    const onScrollOrResize = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    update();

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const keyword = search.trim();
    router.push(keyword ? `/albums?keyword=${encodeURIComponent(keyword)}` : '/albums');
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: '退出登录？',
      text: '退出后本地解锁记录会保留，下次登录仍可继续查看。',
      okText: '退出登录',
    });
    if (ok) {
      logout();
      toast('已退出登录', 'success');
    }
  };

  const goNotifications = () => {
    setMenuOpen(false);
    router.push('/notifications');
  };

  const unread = user?.unreadCount ?? 0;

  return (
    <header className="sticky top-0 z-[60] border-b border-line bg-[rgba(11,11,14,.86)] backdrop-blur-xl">
      <div
        className={cn(
          'mx-auto flex h-[62px] w-full max-w-[1280px] items-center gap-4 px-5',
          mobileCompact && 'hidden lg:flex',
        )}
      >
        <Logo withText={false} className="lg:hidden" />
        <Logo className="hidden lg:flex" />

        <nav className="ml-1 hidden items-center gap-0.5 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn('nav-link', active && 'active')}>
                <Icon size={15} className={active ? 'opacity-100' : 'opacity-70'} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <form
            onSubmit={submitSearch}
            className="hidden h-9 w-[238px] items-center gap-2 rounded-[10px] border border-line bg-panel2 px-3 transition focus-within:border-brand/50 focus-within:bg-[#16161a] md:flex"
          >
            <Search size={15} className="shrink-0 text-t3" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索图集 / 作者 / 标签"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-t3"
            />
          </form>

          {!initialized ? (
            <div className="skeleton h-9 w-[92px]" />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="relative flex items-center"
                onClick={() => setMenuOpen((value) => !value)}
                aria-label="用户菜单"
                aria-expanded={menuOpen}
              >
                <Avatar
                  nickname={user.nickname}
                  avatarType={user.avatarType}
                  avatarIndex={user.avatarIndex}
                  avatarUrl={user.avatarUrl}
                  size={36}
                  className="border-[1.5px] border-white/15"
                />
                {user.isVip ? (
                  <Crown
                    size={13}
                    className="absolute -right-1.5 -top-1.5 rotate-[-8deg] text-[#ffd777] drop-shadow"
                    fill="currentColor"
                  />
                ) : null}
                {unread > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-ink bg-brand" />
                ) : null}
              </button>

              {menuOpen ? (
                <div className="fade-up absolute right-0 top-[46px] w-[218px] rounded-[13px] border border-line2 bg-panel2 p-1.5 shadow-[var(--shadow-card)]">
                  <div className="mb-1 border-b border-line px-2.5 pb-2.5 pt-2">
                    <div className="flex items-center gap-2">
                      <b className="truncate text-[13.5px]">{user.nickname}</b>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                          roleBadgeClass(user.effectiveRole),
                        )}
                      >
                        {ROLE_LABELS[user.effectiveRole]}
                      </span>
                    </div>
                    <span className="mt-0.5 block truncate text-[11.5px] text-t3">
                      {user.email}
                    </span>
                  </div>

                  <MenuItem href="/profile" icon={<User size={15} />} label="个人中心" />
                  <button type="button" className="menu-item" onClick={goNotifications}>
                    <Bell size={15} />
                    <span>我的通知</span>
                    {unread > 0 ? (
                      <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    ) : null}
                  </button>
                  <MenuItem href="/favorites" icon={<Heart size={15} />} label="我的收藏" />
                  <MenuItem href="/purchases" icon={<Receipt size={15} />} label="我的购买" />

                  {user.role === 'admin' ? (
                    <>
                      <div className="my-1 h-px bg-line" />
                      <button
                        type="button"
                        className="menu-item"
                        onClick={() => {
                          setMenuOpen(false);
                          toast('管理后台正在建设中，后续版本开放', 'info');
                        }}
                      >
                        <Shield size={15} />
                        <span>管理后台 · 发布图集</span>
                      </button>
                    </>
                  ) : null}

                  <div className="my-1 h-px bg-line" />
                  <button
                    type="button"
                    className="menu-item text-[#ff6b81] hover:text-[#ff8798]"
                    onClick={handleLogout}
                  >
                    <LogOut size={15} />
                    <span>退出登录</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button type="button" className="btn btn-brand" onClick={() => openAuth('login')}>
              登录 / 注册
            </button>
          )}
        </div>
      </div>

      <div className={cn('lg:hidden', !mobileCompact && 'border-t border-line')}>
        <div className={cn('no-scrollbar flex overflow-x-auto px-3', mobileCompact && 'hidden')}>
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] transition',
                  active
                    ? 'border-brand font-semibold text-white'
                    : 'border-transparent text-t2 hover:text-t1',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <form
          onSubmit={submitSearch}
          className={cn(
            'mx-3 flex h-9 items-center gap-2 rounded-[10px] border border-line bg-panel2 px-3 transition focus-within:border-brand/50 focus-within:bg-[#16161a]',
            mobileCompact ? 'my-2' : 'mb-2.5',
          )}
        >
          <Search size={15} className="shrink-0 text-t3" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索图集 / 作者 / 标签"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-t3"
            aria-label="搜索图集 / 作者 / 标签"
          />
        </form>
      </div>
    </header>
  );
}

function MenuItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="menu-item">
      {icon}
      <span>{label}</span>
    </Link>
  );
}
