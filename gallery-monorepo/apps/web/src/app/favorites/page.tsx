'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Heart } from 'lucide-react';

import type { AlbumCardDto, PageResult } from '@sylvie/types';
import { EmptyState, Pagination, AlbumGridSkeleton } from '@sylvie/ui/web';

import { AlbumCard } from '@/components/album-card';
import { AuthGate } from '@/components/auth-gate';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function FavoritesContent() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useSWR<PageResult<AlbumCardDto>>(
    [`/me/favorites`, token, page],
    () => apiFetch<PageResult<AlbumCardDto>>(`/api/me/favorites?page=${page}&pageSize=12`),
  );

  return (
    <div className="wrap">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <h1 className="page-title">我的收藏</h1>
          <p className="mt-1.5 text-[13px] text-t3">
            {data ? `共 ${data.total} 套 · 第 ${data.page} / ${data.totalPages} 页` : '加载中…'}
          </p>
        </div>
        <Link href="/albums" className="ml-auto text-xs text-t3 transition hover:text-brand2">
          去发现更多 ›
        </Link>
      </div>

      {isLoading && !data ? (
        <AlbumGridSkeleton count={8} />
      ) : error && !data ? (
        <div className="panel px-6 py-14 text-center">
          <p className="text-t2">收藏列表加载失败</p>
          <button type="button" className="btn btn-outline mt-4" onClick={() => mutate()}>
            重新加载
          </button>
        </div>
      ) : data && data.list.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
            {data.list.map((album, index) => (
              <AlbumCard key={album.id} album={album} index={index} />
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
            icon={<Heart size={22} />}
            title="还没有收藏任何图集"
            text="在图集卡片右下角点击星标即可收藏。"
            action={
              <Link href="/albums" className="btn btn-brand">
                去逛图集
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}

export default function FavoritesPage() {
  return (
    <AuthGate>
      <FavoritesContent />
    </AuthGate>
  );
}
