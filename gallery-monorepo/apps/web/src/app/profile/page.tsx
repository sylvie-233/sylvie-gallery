'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import {
  CalendarCheck,
  Crown,
  Heart,
  Mail,
  Pencil,
  Receipt,
  Sparkles,
  Users,
} from 'lucide-react';

import {
  ROLE_LABELS,
  type AuthorDto,
  type CheckinResult,
  type CheckinStatus,
  type PageResult,
  type PurchaseData,
  type AlbumCardDto,
} from '@sylvie/types';
import { cn, formatDate } from '@sylvie/utils';
import { Avatar, EmptyState, Pagination } from '@sylvie/ui/web';

import { AlbumCard } from '@/components/album-card';
import { AuthGate } from '@/components/auth-gate';
import { AuthorCard } from '@/components/author-card';
import { ProfileEditModal } from '@/components/profile-edit-modal';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

function roleBadgeClass(role: string): string {
  if (role === 'vip') return 'bg-[rgba(255,215,119,.14)] text-[#ffd777]';
  if (role === 'admin') return 'bg-[rgba(122,150,255,.14)] text-[#8fa6ff]';
  return 'bg-white/[0.07] text-t2';
}

function ProfileContent() {
  const { user, token, refreshUser, revalidateAll } = useAuth();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [subPage, setSubPage] = useState(1);
  const [checkinPending, setCheckinPending] = useState(false);

  const { data: favorites } = useSWR<PageResult<AlbumCardDto>>(
    user ? [`/me/favorites?pageSize=4`, token] : null,
    () => apiFetch<PageResult<AlbumCardDto>>('/api/me/favorites?page=1&pageSize=4'),
  );

  const { data: purchases } = useSWR<PurchaseData>(
    user ? [`/orders/mine?overview`, token] : null,
    () => apiFetch<PurchaseData>('/api/orders/mine?ordersPage=1&unlocksPage=1&pageSize=1'),
  );

  const { data: subscriptions } = useSWR<PageResult<AuthorDto>>(
    user ? [`/me/subscriptions`, token, subPage] : null,
    () => apiFetch<PageResult<AuthorDto>>(`/api/me/subscriptions?page=${subPage}&pageSize=12`),
  );

  const { data: checkin, mutate: mutateCheckin } = useSWR<CheckinStatus>(
    user ? [`/auth/checkin`, token] : null,
    () => apiFetch<CheckinStatus>('/api/auth/checkin'),
  );

  if (!user) {
    return null;
  }

  const purchaseCount = (purchases?.overview.vipOrderCount ?? 0) + (purchases?.overview.unlockedCount ?? 0);

  const doCheckin = async () => {
    if (checkinPending) {
      return;
    }
    setCheckinPending(true);
    try {
      const result = await apiFetch<CheckinResult>('/api/auth/checkin', { method: 'POST' });
      toast(result.message, result.checkin ? 'success' : 'info');
      await refreshUser();
      await mutateCheckin();
      void revalidateAll();
    } catch (error) {
      toast(error instanceof Error ? error.message : '签到失败', 'error');
    } finally {
      setCheckinPending(false);
    }
  };

  return (
    <div className="wrap">
      <div className="mb-4">
        <h1 className="page-title">个人中心</h1>
        <p className="mt-1.5 text-[13px] text-t3">账号信息、签到积分与订阅作者</p>
      </div>

      <section className="panel flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <Avatar
          nickname={user.nickname}
          avatarType={user.avatarType}
          avatarIndex={user.avatarIndex}
          avatarUrl={user.avatarUrl}
          size={58}
          className="border-2 border-white/15"
        />
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-[18px] font-bold">
            {user.nickname}
            <span className={cn('rounded px-2 py-0.5 text-[10.5px] font-semibold', roleBadgeClass(user.effectiveRole))}>
              {ROLE_LABELS[user.effectiveRole]}
            </span>
          </h2>
          <p className="mt-1.5 text-[12.5px] text-t3">{user.email}</p>
          <button
            type="button"
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-line2 px-3 py-1 text-[11.5px] text-t2 transition hover:border-[#50505d] hover:bg-white/5 hover:text-white"
            onClick={() => setEditOpen(true)}
          >
            <Pencil size={12} />
            编辑资料
          </button>
        </div>

        <div className="ml-auto flex flex-wrap gap-2.5">
          {[
            { label: '收藏', value: favorites?.total ?? 0 },
            { label: '购买', value: purchaseCount },
            { label: '订阅', value: subscriptions?.total ?? 0 },
          ].map((stat) => (
            <div
              key={stat.label}
              className="min-w-[74px] rounded-[10px] border border-line bg-panel2 px-4 py-2 text-center"
            >
              <b className="block text-[16px] tabular-nums">{stat.value}</b>
              <span className="text-[11px] text-t3">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="panel p-5">
          <h3 className="text-[14px] font-bold">账号详情</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel2 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[11.5px] text-t3">
                <Mail size={12} />
                邮箱
              </p>
              <p className="mt-1.5 truncate text-[13px]">{user.email}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel2 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[11.5px] text-t3">
                <Crown size={12} />
                会员状态
              </p>
              <p className="mt-1.5 text-[13px]">
                {user.isVip
                  ? `付费会员 · 至 ${formatDate(user.vipExpireAt)}`
                  : '注册会员 · 未开通付费会员'}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-panel2 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[11.5px] text-t3">
                <Sparkles size={12} />
                解锁积分
              </p>
              <p className="mt-1.5 text-[13px] tabular-nums">{user.points} 分</p>
            </div>
            <div className="rounded-xl border border-line bg-panel2 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[11.5px] text-t3">
                <Users size={12} />
                已订阅作者
              </p>
              <p className="mt-1.5 text-[13px] tabular-nums">{subscriptions?.total ?? 0} 位</p>
            </div>
          </div>
        </section>

        <section className="panel flex flex-col p-5">
          <h3 className="flex items-center gap-1.5 text-[14px] font-bold">
            <CalendarCheck size={15} className="text-brand2" />
            每日签到
          </h3>
          <p className="mt-2 text-[12.5px] leading-relaxed text-t3">
            每天签到可领取 {checkin?.dailyPoints ?? 2} 解锁积分，积分仅用于解锁图集，下载不扣分。
          </p>
          <div className="mt-auto flex items-center gap-2 pt-4">
            <span className="text-[12px] text-t3">
              当前 {user.points} 积分
              {checkin?.checkedIn ? ' · 今日已签到' : ''}
            </span>
            <button
              type="button"
              className={checkin?.checkedIn ? 'btn btn-outline btn-sm ml-auto' : 'btn btn-brand btn-sm ml-auto'}
              onClick={doCheckin}
              disabled={checkin?.checkedIn || checkinPending}
            >
              {checkin?.checkedIn ? '已签到' : checkinPending ? '签到中…' : `签到 +${checkin?.dailyPoints ?? 2}`}
            </button>
          </div>
        </section>
      </div>

      {favorites && favorites.list.length > 0 ? (
        <section className="mt-7">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="section-title">最近收藏</h2>
            <Link href="/favorites" className="ml-auto text-xs text-t3 transition hover:text-brand2">
              查看全部 ›
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
            {favorites.list.map((album, index) => (
              <AlbumCard key={album.id} album={album} index={index} />
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-7">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="section-title">最近收藏</h2>
          </div>
          <div className="panel">
            <EmptyState
              icon={<Heart size={20} />}
              title="还没有收藏"
              text="喜欢某套图集时点一下星标，会出现在这里。"
              action={
                <Link href="/albums" className="btn btn-outline">
                  去逛图集
                </Link>
              }
            />
          </div>
        </section>
      )}

      <section className="mt-7">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="section-title">已订阅作者</h2>
          <span className="text-xs text-t3">
            {subscriptions
              ? `${subscriptions.total} 位 · 第 ${subscriptions.page} / ${subscriptions.totalPages} 页`
              : ''}
          </span>
          <Link href="/purchases" className="ml-auto inline-flex items-center gap-1 text-xs text-t3 transition hover:text-brand2">
            <Receipt size={12} />
            我的购买
          </Link>
        </div>

        {subscriptions && subscriptions.list.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {subscriptions.list.map((author) => (
                <AuthorCard key={author.id} author={author} />
              ))}
            </div>
            <Pagination
              page={subscriptions.page}
              totalPages={subscriptions.totalPages}
              onChange={(nextPage) => {
                setSubPage(nextPage);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        ) : (
          <div className="panel">
            <EmptyState
              icon={<Users size={20} />}
              title="还没有订阅作者"
              text="在作者主页点击订阅，有新图时会收到站内通知。"
              action={
                <Link href="/authors" className="btn btn-outline">
                  去发现作者
                </Link>
              }
            />
          </div>
        )}
      </section>

      <ProfileEditModal open={editOpen} user={user} onClose={() => setEditOpen(false)} />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGate>
      <ProfileContent />
    </AuthGate>
  );
}
