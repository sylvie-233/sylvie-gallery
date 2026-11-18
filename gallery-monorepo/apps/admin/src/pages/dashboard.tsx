import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import {
  ArrowUpRight,
  CalendarDays,
  Coins,
  Eye,
  Image as ImageIcon,
  MessageSquare,
  PlusCircle,
  Settings,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';

import type { AdminDashboard, AdminTrend, TrendMode } from '@sylvie/types';
import { formatCount } from '@sylvie/utils';

import { AlbumStatusBadge, Badge, LoadingRows, PageError } from '@/components/ui';
import { TrendChart } from '@/components/trend-chart';
import { adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { formatDateTime, formatYuan } from '@/lib/date';

function readTrendMode(): TrendMode {
  const value = window.localStorage.getItem('sylvie_admin_trend');
  return value === '30d' || value === '6m' ? value : '7d';
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { token } = useAdminAuth();
  const [mode, setMode] = useState<TrendMode>(readTrendMode);

  const { data, error, mutate } = useSWR<AdminDashboard>(
    token ? ['/dashboard', token] : null,
    () => adminFetch<AdminDashboard>('/dashboard'),
  );
  const { data: trend } = useSWR<AdminTrend>(
    token ? ['/dashboard/trend', token, mode] : null,
    () => adminFetch<AdminTrend>(`/dashboard/trend?mode=${mode}`),
  );

  const changeMode = (next: TrendMode) => {
    setMode(next);
    window.localStorage.setItem('sylvie_admin_trend', next);
  };

  if (error && !data) {
    return (
      <div className="panel">
        <PageError message="看板数据加载失败" onRetry={() => mutate()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
        <div className="panel">
          <LoadingRows rows={6} />
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: '今日营收',
      note: '现金订单 · 实时',
      value: formatYuan(data.today.revenueCents),
      desc: `今日 ${data.today.orderCount} 笔现金订单`,
      red: true,
      icon: Wallet,
    },
    {
      label: '积分解锁',
      note: '今日',
      value: `${data.today.unlockCount} 套`,
      desc: `消耗 ${data.today.unlockPoints} 积分`,
      icon: Coins,
    },
    {
      label: '今日新增用户',
      value: `+${data.today.newUsers}`,
      desc: `注册用户 ${data.site.userTotal}`,
      icon: UserPlus,
    },
    {
      label: '今日 PV',
      value: formatCount(data.today.pv),
      desc: `UV ${data.today.uv}`,
      icon: Eye,
    },
    {
      label: '图集总数',
      value: data.site.albumTotal,
      desc: `已发布 ${data.site.publishedAlbums} · 草稿 ${data.site.draftAlbums}`,
      icon: ImageIcon,
    },
    {
      label: '注册用户',
      value: data.site.userTotal,
      desc: `本月新增 ${data.site.monthNewUsers}`,
      icon: Users,
    },
    {
      label: '付费会员',
      value: data.site.vipTotal,
      desc: `本月新增 ${data.site.monthNewVip}`,
      icon: TrendingUp,
    },
    {
      label: '待审核评论',
      value: data.site.pendingComments,
      desc: '需尽快处理',
      amber: true,
      icon: MessageSquare,
    },
  ];

  const todos = [
    {
      label: '待审核评论',
      count: data.todos.pendingComments,
      icon: '✓',
      onClick: () => navigate('/comments'),
    },
    {
      label: '草稿待发布',
      count: data.todos.draftAlbums,
      icon: '📝',
      onClick: () => navigate('/albums?status=draft'),
    },
    {
      label: '已下架图集',
      count: data.todos.offlineAlbums,
      icon: '⬇',
      onClick: () => navigate('/albums?status=offline'),
    },
    {
      label: '今日新订单',
      count: data.todos.todayOrders,
      icon: '¥',
      onClick: () => navigate('/payments'),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-head mb-0">
        <h1>数据看板</h1>
        <span className="sub flex items-center gap-1.5">
          <CalendarDays size={12} />
          {data.date}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {stats.slice(0, 4).map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {stats.slice(4).map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
        <TrendChart trend={trend} mode={mode} onModeChange={changeMode} />

        <div className="panel">
          <div className="p-title">
            待办事项 <span className="n">点击直达</span>
          </div>
          <div className="p-2.5">
            {todos.map((todo) => (
              <button
                key={todo.label}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] text-t2 transition hover:bg-panel2 hover:text-t1"
                onClick={todo.onClick}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-panel2 text-[12px]">
                  {todo.icon}
                </span>
                {todo.label}
                <span
                  className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                    todo.count > 0 ? 'bg-brand text-white' : 'bg-white/5 text-t3'
                  }`}
                >
                  {todo.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4">
        <div className="panel">
          <div className="p-title">
            最近发布 <span className="n">最新 6 条</span>
            <Link to="/albums" className="ml-auto text-[12px] text-t3 transition hover:text-brand2">
              全部图集 ›
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>图集</th>
                <th className="hide-m">作者</th>
                <th>规格</th>
                <th className="hide-m">发布时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {data.recentAlbums.map((album) => (
                <tr key={album.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <img
                        src={album.coverUrl}
                        alt={album.title}
                        className="h-12 w-9 shrink-0 rounded-md border border-line object-cover"
                      />
                      <div className="min-w-0">
                        <p className="max-w-[260px] truncate text-[13px]">{album.title}</p>
                        <p className="mt-0.5 text-[11px] text-t3">#{album.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hide-m text-[12.5px] text-t2">{album.authorName}</td>
                  <td className="text-[12px] text-t3">
                    {album.imageCount}P{album.videoCount > 0 ? ` · ${album.videoCount}V` : ''}
                  </td>
                  <td className="hide-m text-[12px] tabular-nums text-t3">
                    {formatDateTime(album.publishedAt ?? album.createdAt)}
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <AlbumStatusBadge status={album.status} />
                      {album.isRecommended ? <Badge tone="brand">推荐</Badge> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.recentAlbums.length === 0 ? <div className="empty">暂无图集</div> : null}
        </div>

        <div className="space-y-4">
          <div className="panel">
            <div className="p-title">
              热搜词 TOP5 <span className="n">近 7 天 · 搜索日志</span>
            </div>
            <div className="p-3">
              {data.hotKeywords.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-t3">暂无搜索记录</p>
              ) : (
                data.hotKeywords.map((keyword, index) => (
                  <div
                    key={keyword.keyword}
                    className="flex items-center gap-2.5 border-b border-line px-2 py-2 last:border-b-0"
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold ${
                        index < 3 ? 'bg-brand-dim text-brand2' : 'bg-white/5 text-t3'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="text-[13px]">{keyword.keyword}</span>
                    <span className="ml-auto text-[11px] tabular-nums text-t3">{keyword.count} 次</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="p-title">快捷操作</div>
            <div className="p-2.5">
              {[
                { label: '发布新图集', icon: <PlusCircle size={15} />, to: '/albums/new' },
                {
                  label: '发布公告',
                  icon: <MessageSquare size={15} />,
                  to: '/announcements?new=1',
                },
                { label: '修改站点配置', icon: <Settings size={15} />, to: '/config' },
              ].map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] text-t2 transition hover:bg-panel2 hover:text-t1"
                >
                  {item.icon}
                  {item.label}
                  <ArrowUpRight size={13} className="ml-auto text-t3" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  note,
  value,
  desc,
  red,
  amber,
  icon: Icon,
}: {
  label: string;
  note?: string;
  value: string | number;
  desc: string;
  red?: boolean;
  amber?: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="panel px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[12px] text-t3">
        <Icon size={13} />
        {label}
        {note ? <span className="text-[10.5px] opacity-70">{note}</span> : null}
      </div>
      <div
        className={`mt-1.5 text-[24px] font-extrabold leading-none tracking-tight tabular-nums ${
          red ? 'text-brand' : amber ? 'text-[var(--warning)]' : ''
        }`}
      >
        {value}
      </div>
      <p className="mt-1.5 text-[11px] text-t3">{desc}</p>
    </div>
  );
}
