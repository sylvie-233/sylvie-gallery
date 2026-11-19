'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Bell, Search } from 'lucide-react';

import type { AnnouncementDto, PageResult } from '@sylvie/types';
import { formatDate } from '@sylvie/utils';
import { EmptyState, Pagination, NoticeListSkeleton } from '@sylvie/ui/web';

import { AnnouncementModal } from '@/components/announcement-modal';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AnnouncementsPage() {
  const { token } = useAuth();
  const [keyword, setKeyword] = useState('');
  const [queryKeyword, setQueryKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<AnnouncementDto | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQueryKeyword(keyword.trim());
      setPage(1);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '8');
  if (queryKeyword) {
    params.set('keyword', queryKeyword);
  }

  const { data, error, isLoading, mutate } = useSWR<PageResult<AnnouncementDto>>(
    [`/announcements?${params.toString()}`, token ?? 'guest'],
    () => apiFetch<PageResult<AnnouncementDto>>(`/api/announcements?${params.toString()}`),
  );

  return (
    <div className="wrap">
      <div className="mb-4">
        <h1 className="page-title">公告</h1>
        <p className="mt-1.5 text-[13px] text-t3">站点更新、活动、维护与规则说明</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex w-full max-w-[340px] items-center gap-2 rounded-[10px] border border-line bg-panel px-3.5 py-2.5 transition focus-within:border-brand/50 focus-within:bg-[#16161a]">
          <Search size={15} className="shrink-0 text-t3" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索公告标题 / 内容"
            className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-t3"
          />
        </div>
        <span className="ml-auto text-xs tabular-nums text-t3">
          {data ? `共 ${data.total} 条 · 第 ${data.page} / ${data.totalPages} 页` : '加载中…'}
        </span>
      </div>

      {isLoading && !data ? (
        <NoticeListSkeleton count={5} />
      ) : error && !data ? (
        <div className="panel px-6 py-14 text-center">
          <p className="text-t2">公告加载失败</p>
          <button type="button" className="btn btn-outline mt-4" onClick={() => mutate()}>
            重新加载
          </button>
        </div>
      ) : data && data.list.length > 0 ? (
        <>
          <div className="panel overflow-hidden">
            {data.list.map((announcement) => (
              <button
                key={announcement.id}
                type="button"
                className="w-full border-b border-line px-4 py-4 text-left transition last:border-b-0 hover:bg-panel2 sm:px-5"
                onClick={() => setActive(announcement)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {announcement.isTop ? (
                    <span className="chip chip-brand">置顶</span>
                  ) : null}
                  <span className="chip chip-gray">{announcement.typeLabel}</span>
                  <span className="text-[11.5px] tabular-nums text-t3">
                    {formatDate(announcement.publishedAt)}
                  </span>
                </div>
                <h3 className="mt-2 text-[14.5px] font-semibold text-[#ececef]">
                  {announcement.title}
                </h3>
                {announcement.summary ? (
                  <p className="clamp-2 mt-1.5 text-[12.5px] leading-relaxed text-t3">
                    {announcement.summary}
                  </p>
                ) : null}
              </button>
            ))}
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
            title={queryKeyword ? '没有找到相关公告' : '暂无公告'}
            text={queryKeyword ? '换个关键词试试。' : '有新公告时会在这里展示。'}
            action={
              queryKeyword ? (
                <button type="button" className="btn btn-outline" onClick={() => setKeyword('')}>
                  清空搜索
                </button>
              ) : undefined
            }
          />
        </div>
      )}

      <AnnouncementModal announcement={active} onClose={() => setActive(null)} />
    </div>
  );
}
