'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Bell, Crown, Image as ImageIcon, Info, ShieldCheck } from 'lucide-react';

import type { NotificationDto, NotificationType, PageResult } from '@sylvie/types';
import { cn, formatDateTime } from '@sylvie/utils';

import { AuthGate } from '@/components/auth-gate';
import { CoverImage } from '@/components/cover-image';
import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

type NotificationPage = PageResult<NotificationDto> & { unread: number };

function notificationIcon(type: NotificationType) {
  if (type === 'review') {
    return { node: <ShieldCheck size={16} />, className: 'bg-[rgba(224,165,58,.14)] text-[#e0a53a]' };
  }
  if (type === 'update') {
    return { node: <ImageIcon size={16} />, className: 'bg-brand-dim text-brand2' };
  }
  if (type === 'benefit') {
    return { node: <Crown size={16} />, className: 'bg-[rgba(255,215,119,.15)] text-[#ffd777]' };
  }
  return { node: <Info size={16} />, className: 'bg-[rgba(122,150,255,.14)] text-[#8fa6ff]' };
}

function NotificationDetailModal({
  notification,
  onClose,
}: {
  notification: NotificationDto | null;
  onClose: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!notification) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [notification, onClose]);

  if (!notification) {
    return null;
  }
  const icon = notificationIcon(notification.type);

  return (
    <div className="modal-mask" onClick={onClose} role="presentation">
      <div
        className="modal-card max-w-[560px] p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 border-b border-line pb-4">
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', icon.className)}>
            {icon.node}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="chip chip-gray">{notification.typeLabel}</span>
              <span className="text-[11.5px] text-t3">
                {formatDateTime(notification.createdAt)}
              </span>
            </div>
            <h2 className="text-[16px] font-bold leading-snug">{notification.title}</h2>
          </div>
          <button
            type="button"
            className="text-t3 transition hover:text-t1"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <p className="mt-4 whitespace-pre-line text-[13.5px] leading-[1.9] text-t2">
          {notification.content}
        </p>

        {notification.album ? (
          <button
            type="button"
            className="mt-5 flex w-full items-center gap-3 rounded-xl border border-line bg-panel p-3 text-left transition hover:border-line2 hover:bg-panel3"
            onClick={() => {
              onClose();
              router.push(`/albums/${notification.album?.id}`);
            }}
          >
            <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-line">
              <CoverImage src={notification.album.coverUrl} alt={notification.album.title} fallback="希" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold">{notification.album.title}</p>
              <p className="mt-1 text-[12px] text-t3">
                {notification.album.imageCount}P
                {notification.album.videoCount > 0 ? ` · ${notification.album.videoCount}V` : ''} ·{' '}
                {notification.album.authorName}
              </p>
              <p className="mt-1.5 text-[12px] font-semibold text-brand2">查看图集 ›</p>
            </div>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NotificationsContent() {
  const { token, refreshUser, revalidateAll } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<NotificationDto | null>(null);
  const [marking, setMarking] = useState(false);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '5');
  params.set('filter', filter);

  const { data, error, isLoading, mutate } = useSWR<NotificationPage>(
    [`/notifications?${params.toString()}`, token],
    () => apiFetch<NotificationPage>(`/api/notifications?${params.toString()}`),
  );

  const switchFilter = (next: 'all' | 'unread') => {
    setFilter(next);
    setPage(1);
  };

  const openNotification = async (notification: NotificationDto) => {
    setActive(notification);
    if (notification.isRead) {
      return;
    }
    try {
      await apiFetch<null>(`/api/notifications/${notification.id}/read`, { method: 'POST' });
      await mutate();
      await refreshUser();
    } catch {
      // 打开详情不因标记已读失败而中断
    }
  };

  const markAllRead = async () => {
    if (marking || (data?.unread ?? 0) === 0) {
      return;
    }
    setMarking(true);
    try {
      await apiFetch<null>('/api/notifications/read-all', { method: 'POST' });
      toast('全部通知已标记为已读', 'success');
      await mutate();
      await refreshUser();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '操作失败', 'error');
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="wrap">
      <div className="mb-4">
        <h1 className="page-title">我的通知</h1>
        <p className="mt-1.5 text-[13px] text-t3">审核结果、作者更新、权益变更与系统消息</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-[10px] border border-line bg-panel p-1">
          <button
            type="button"
            className={cn(
              'rounded-md px-3.5 py-1.5 text-[12.5px] tabular-nums transition',
              filter === 'all' ? 'bg-brand-dim font-semibold text-brand2' : 'text-t2 hover:text-t1',
            )}
            onClick={() => switchFilter('all')}
          >
            全部 {data ? data.total : 0}
          </button>
          <button
            type="button"
            className={cn(
              'rounded-md px-3.5 py-1.5 text-[12.5px] tabular-nums transition',
              filter === 'unread' ? 'bg-brand-dim font-semibold text-brand2' : 'text-t2 hover:text-t1',
            )}
            onClick={() => switchFilter('unread')}
          >
            未读 {data?.unread ?? 0}
          </button>
        </div>
        <span className="text-xs tabular-nums text-t3">
          {data ? `共 ${data.total} 条 · 第 ${data.page} / ${data.totalPages} 页` : ''}
        </span>
        <button
          type="button"
          className="ml-auto text-[12.5px] text-t3 transition hover:text-brand2 disabled:opacity-40"
          onClick={markAllRead}
          disabled={marking || (data?.unread ?? 0) === 0}
        >
          全部标为已读
        </button>
      </div>

      {isLoading && !data ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-[84px] w-full" />
          ))}
        </div>
      ) : error && !data ? (
        <div className="panel px-6 py-14 text-center">
          <p className="text-t2">通知加载失败</p>
          <button type="button" className="btn btn-outline mt-4" onClick={() => mutate()}>
            重新加载
          </button>
        </div>
      ) : data && data.list.length > 0 ? (
        <>
          <div className="space-y-2.5">
            {data.list.map((notification) => {
              const icon = notificationIcon(notification.type);
              return (
                <button
                  key={notification.id}
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl border border-line bg-panel p-3.5 text-left transition hover:border-line2 hover:bg-[#17171c]',
                    notification.isRead && 'opacity-60 hover:opacity-85',
                  )}
                  onClick={() => openNotification(notification)}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', icon.className)}>
                    {icon.node}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <b
                        className={cn(
                          'text-[13.5px]',
                          notification.isRead ? 'font-normal text-[#b9b9c2]' : 'font-semibold text-[#ececef]',
                        )}
                      >
                        {notification.title}
                      </b>
                      <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10.5px] text-t2">
                        {notification.typeLabel}
                      </span>
                      <span className="ml-auto whitespace-nowrap text-[11.5px] text-t3">
                        {formatDateTime(notification.createdAt)}
                      </span>
                    </span>
                    <span className="mt-1.5 block text-[12.5px] leading-relaxed text-t3">
                      {notification.content}
                    </span>
                  </span>
                  {!notification.isRead ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" /> : null}
                </button>
              );
            })}
          </div>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={(nextPage) => {
              setPage(nextPage);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      ) : (
        <div className="panel">
          <EmptyState
            icon={<Bell size={22} />}
            title={filter === 'unread' ? '没有未读通知' : '暂无通知'}
            text={
              filter === 'unread'
                ? '所有通知都看完啦，切换到「全部」可以回看历史消息。'
                : '审核结果、订阅更新与权益变更会在这里通知你。'
            }
            action={
              filter === 'unread' ? (
                <button type="button" className="btn btn-outline" onClick={() => switchFilter('all')}>
                  查看全部通知
                </button>
              ) : (
                <Link href="/albums" className="btn btn-outline">
                  去逛图集
                </Link>
              )
            }
          />
        </div>
      )}

      <NotificationDetailModal notification={active} onClose={() => setActive(null)} />
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGate>
      <NotificationsContent />
    </AuthGate>
  );
}
