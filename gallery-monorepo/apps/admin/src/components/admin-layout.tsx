import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  CreditCard,
  Images,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PlusCircle,
  ScrollText,
  Settings,
  Tags,
  UserCog,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { AdminDashboard } from '@sylvie/types';
import { cn } from '@sylvie/utils';

import { adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { AvatarBox } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  match?: (pathname: string) => boolean;
}

interface NavGroup {
  title: string | null;
  items: NavItem[];
}

const isEditor = (pathname: string) =>
  pathname === '/albums/new' || /^\/albums\/\d+\/edit$/.test(pathname);

const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [{ to: '/', label: '数据看板', icon: LayoutDashboard, exact: true }],
  },
  {
    title: '内容管理',
    items: [
      {
        to: '/albums',
        label: '图集管理',
        icon: Images,
        match: (pathname) => pathname === '/albums',
      },
      { to: '/albums/new', label: '图集编辑器', icon: PlusCircle, match: isEditor },
      { to: '/tags', label: '标签管理', icon: Tags },
      { to: '/authors', label: '作者管理', icon: Users },
    ],
  },
  {
    title: '互动运营',
    items: [
      { to: '/comments', label: '评论审核', icon: MessageSquare },
      { to: '/announcements', label: '公告管理', icon: Bell },
    ],
  },
  {
    title: '交易与用户',
    items: [
      { to: '/payments', label: '支付流水', icon: CreditCard },
      { to: '/users', label: '用户管理', icon: UserCog },
    ],
  },
  {
    title: '系统',
    items: [
      { to: '/config', label: '友链与配置', icon: Settings },
      { to: '/agent-tokens', label: 'Agent 令牌', icon: KeyRound },
      { to: '/logs', label: '操作日志', icon: ScrollText },
    ],
  },
];

const TITLE_MAP: Record<string, string> = {
  '/': '数据看板',
  '/albums': '图集管理',
  '/albums/new': '图集编辑器',
  '/tags': '标签管理',
  '/authors': '作者管理',
  '/comments': '评论审核',
  '/announcements': '公告管理',
  '/payments': '支付流水',
  '/users': '用户管理',
  '/config': '友链与配置',
  '/logs': '操作日志',
  '/agent-tokens': 'Agent 令牌',
};

function pageTitle(pathname: string): string {
  if (isEditor(pathname)) return '图集编辑器';
  return TITLE_MAP[pathname] ?? '管理后台';
}

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token, logout } = useAdminAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const { data: dashboard } = useSWR<AdminDashboard>(
    token ? ['/dashboard', token] : null,
    () => adminFetch<AdminDashboard>('/dashboard'),
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const handleLogout = async () => {
    const ok = await confirm({
      title: '退出登录？',
      text: '退出后需要重新使用管理员账号登录。',
      okText: '退出登录',
    });
    if (ok) {
      logout();
      toast('已退出管理后台', 'success');
      navigate('/login', { replace: true });
    }
  };

  const pending = dashboard?.todos.pendingComments ?? 0;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[224px] shrink-0 flex-col overflow-y-auto border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 px-[18px] pb-4 pt-5">
          <span className="gradient flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[linear-gradient(135deg,#ff2d55,#ff7a45)] text-[15px] font-extrabold text-white">
            希
          </span>
          <span className="min-w-0">
            <b className="block text-[15px]">希尔薇图集</b>
            <span className="block text-[11px] text-t3">管理后台 · v1</span>
          </span>
        </div>

        <nav className="flex-1 px-2.5 py-1.5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title ?? 'main'} className="mb-1">
              {group.title ? (
                <p className="px-3 pb-1 pt-3 text-[11px] tracking-[1px] text-t3">{group.title}</p>
              ) : null}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.match
                  ? item.match(location.pathname)
                  : item.exact
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      'admin-nav-link mb-0.5 flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13.5px] transition',
                      active
                        ? 'is-active bg-brand-dim font-semibold text-brand2'
                        : 'text-t2 hover:bg-panel2 hover:text-t1',
                    )}
                  >
                    <Icon size={16} className={active ? 'opacity-100' : 'opacity-70'} />
                    <span>{item.label}</span>
                    {item.to === '/comments' && pending > 0 ? (
                      <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
                        {pending > 99 ? '99+' : pending}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-line px-3.5 py-3">
          <a
            href={import.meta.env.VITE_WEB_URL ?? 'http://localhost:3001'}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-[12.5px] text-t3 transition hover:text-t2"
          >
            <ArrowLeft size={14} />
            返回前台首页
          </a>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-[12.5px] text-t3 transition hover:text-t2"
            onClick={handleLogout}
          >
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[58px] items-center gap-3 border-b border-line bg-[rgba(20,20,23,.9)] px-6 backdrop-blur">
          <div className="flex items-center gap-1.5 text-[13px] text-t3">
            <span>管理后台</span>
            <ChevronRight size={13} className="opacity-50" />
            <b className="font-semibold text-t1">{pageTitle(location.pathname)}</b>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2.5 text-[13px] text-t2">
            <AvatarBox
              name={user?.nickname ?? '管理员'}
              avatarUrl={user?.avatarUrl ?? null}
              color="#ff2d55"
              size={30}
              rounded={15}
            />
            <span className="max-w-[180px] truncate">{user?.email ?? 'admin@sylvie.cc'}</span>
            <span className="rounded-md border border-brand/40 px-1.5 py-0.5 text-[11px] text-brand2">
              管理员
            </span>
          </div>
        </header>

        <main
          key={location.pathname}
          className="admin-page-enter mx-auto w-full max-w-[1240px] flex-1 px-6 py-6"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
