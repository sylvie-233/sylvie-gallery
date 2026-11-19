'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { FilterX } from 'lucide-react';

import { SORT_LABELS, type AlbumCardDto, type PageResult, type SortType } from '@sylvie/types';
import { cn } from '@sylvie/utils';
import { EmptyState, Pagination, AlbumGridSkeleton } from '@sylvie/ui/web';

import { AlbumCard } from '@/components/album-card';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const SORTS: SortType[] = ['new', 'hot', 'fav'];

function AlbumsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();

  const sort = (searchParams.get('sort') as SortType | null) ?? 'new';
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const tag = searchParams.get('tag') ?? '';
  const keyword = searchParams.get('keyword') ?? '';

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '24');
    params.set('sort', sort);
    if (tag) params.set('tag', tag);
    if (keyword) params.set('keyword', keyword);
    return params.toString();
  }, [page, sort, tag, keyword]);

  const { data, error, isLoading, mutate } = useSWR<PageResult<AlbumCardDto>>(
    [`/albums?${query}`, token ?? 'guest'],
    () => apiFetch<PageResult<AlbumCardDto>>(`/api/albums?${query}`),
  );

  const navigate = (changes: Record<string, string | null>, resetPage = true) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    if (resetPage) {
      params.delete('page');
    }
    const queryString = params.toString();
    router.push(queryString ? `/albums?${queryString}` : '/albums');
  };

  const changePage = (nextPage: number) => {
    navigate({ page: nextPage > 1 ? String(nextPage) : null }, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="wrap">
      <div className="mb-4">
        <h1 className="page-title">图集</h1>
        <p className="mt-1.5 text-[13px] text-t3">按标签与关键词筛选 · 每页 24 套图集</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex gap-1.5 rounded-[11px] border border-line bg-panel p-1">
          {SORTS.map((value) => (
            <button
              key={value}
              type="button"
              className={cn(
                'rounded-lg px-4 py-1.5 text-[13px] transition',
                sort === value
                  ? 'bg-brand-dim font-semibold text-brand2'
                  : 'text-t2 hover:text-t1',
              )}
              onClick={() => navigate({ sort: value === 'new' ? null : value })}
            >
              {SORT_LABELS[value]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-t3">
          {data ? `共 ${data.total} 套 · 第 ${data.page} / ${data.totalPages} 页` : '加载中…'}
        </span>
      </div>

      {tag || keyword ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {tag ? (
            <span className="chip chip-brand">
              <b className="font-semibold text-t1">标签</b>
              <span>#{tag}</span>
              <button
                type="button"
                className="ml-1 opacity-70 transition hover:opacity-100"
                onClick={() => navigate({ tag: null })}
                aria-label="移除标签筛选"
              >
                ×
              </button>
            </span>
          ) : null}
          {keyword ? (
            <span className="chip chip-brand">
              <b className="font-semibold text-t1">关键词</b>
              <span>{keyword}</span>
              <button
                type="button"
                className="ml-1 opacity-70 transition hover:opacity-100"
                onClick={() => navigate({ keyword: null })}
                aria-label="移除关键词"
              >
                ×
              </button>
            </span>
          ) : null}
          <button
            type="button"
            className="chip hover:text-t1"
            onClick={() => router.push('/albums')}
          >
            <FilterX size={12} />
            清除全部
          </button>
        </div>
      ) : null}

      {isLoading && !data ? (
        <AlbumGridSkeleton count={10} />
      ) : error && !data ? (
        <div className="panel px-6 py-16 text-center">
          <p className="text-t2">图集加载失败</p>
          <button type="button" className="btn btn-outline mt-4" onClick={() => mutate()}>
            重新加载
          </button>
        </div>
      ) : data && data.list.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {data.list.map((album, index) => (
              <AlbumCard key={album.id} album={album} index={index} eager={index < 5} />
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={changePage} />
        </>
      ) : (
        <div className="panel">
          <EmptyState
            icon={<FilterX size={22} />}
            title="没有找到匹配的图集"
            text="换个关键词或清除标签筛选后再试试。"
            action={
              <button type="button" className="btn btn-outline" onClick={() => router.push('/albums')}>
                查看全部图集
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

export default function AlbumsPage() {
  return (
    <Suspense
      fallback={
        <div className="wrap">
          <div className="skeleton h-8 w-32" />
          <div className="mt-6">
            <AlbumGridSkeleton count={10} />
          </div>
        </div>
      }
    >
      <AlbumsContent />
    </Suspense>
  );
}
