'use client';

import { useEffect, useMemo, useRef } from 'react';
import useSWRInfinite from 'swr/infinite';
import { Sparkles } from 'lucide-react';

import type { AlbumCardDto, PageResult } from '@sylvie/types';
import { EmptyState, AlbumGridSkeleton } from '@sylvie/ui/web';

import { AlbumCard } from '@/components/album-card';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const MAX_ITEMS = 48;

export default function WaterfallPage() {
  const { token } = useAuth();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<
    PageResult<AlbumCardDto>
  >(
    (index) => [
      index === 0 ? '/feed?page=1&pageSize=24' : `/feed?page=${index + 1}&pageSize=12`,
      token ?? 'guest',
    ],
    ([path]) => apiFetch<PageResult<AlbumCardDto>>(`/api${path as string}`),
    { revalidateFirstPage: false },
  );

  const items = useMemo(() => {
    const seen = new Set<number>();
    const list: AlbumCardDto[] = [];
    for (const page of data ?? []) {
      for (const album of page.list) {
        if (!seen.has(album.id)) {
          seen.add(album.id);
          list.push(album);
        }
      }
    }
    return list;
  }, [data]);

  const total = data?.[0]?.total ?? 0;
  const limit = Math.min(total, MAX_ITEMS);
  const hasMore = items.length < limit;
  const reachedEnd = !hasMore && items.length > 0;
  const loadingMore = isValidating && size > 1;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isValidating) {
          void setSize(size + 1);
        }
      },
      { rootMargin: '500px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isValidating, setSize, size]);

  return (
    <div className="wrap">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="page-title">瀑布流</h1>
          <p className="mt-1.5 text-[13px] text-t3">
            根据浏览与收藏偏好推荐
            {data ? ` · 已加载 ${items.length} 套` : ' · 正在加载…'}
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-t3">
          <Sparkles size={13} className="text-brand2" />
          个人推荐
        </span>
      </div>

      {error && items.length === 0 ? (
        <div className="panel px-6 py-16 text-center">
          <p className="text-t2">推荐内容加载失败</p>
          <button type="button" className="btn btn-outline mt-4" onClick={() => mutate()}>
            重新加载
          </button>
        </div>
      ) : !data && isValidating ? (
        <AlbumGridSkeleton masonry count={10} />
      ) : items.length === 0 && !isValidating ? (
        <div className="panel">
          <EmptyState title="暂时没有推荐内容" text="去图集页逛逛，收藏几套喜欢的作品吧。" />
        </div>
      ) : (
        <>
          <div className="masonry">
            {items.map((album, index) => (
              <AlbumCard key={album.id} album={album} masonry index={index} eager={index < 8} />
            ))}
          </div>

          {loadingMore ? <AlbumGridSkeleton masonry count={4} className="mt-3.5" /> : null}

          {hasMore ? <div ref={sentinelRef} className="h-10" /> : null}

          {reachedEnd ? (
            <p className="py-8 text-center text-[12.5px] text-t3">
              {total > MAX_ITEMS ? '已经到底啦，去图集页发现更多' : '已经到底啦'}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
