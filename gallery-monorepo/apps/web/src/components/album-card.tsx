'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';

import type { AlbumCardDto } from '@sylvie/types';
import { cn, formatCount } from '@sylvie/utils';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { AuthorAvatar } from './avatar';
import { CoverImage } from './cover-image';

const MASONRY_HEIGHTS = [300, 338, 372, 404, 320, 352];

interface AlbumCardProps {
  album: AlbumCardDto;
  masonry?: boolean;
  index?: number;
  className?: string;
  eager?: boolean;
}

export function AlbumCard({ album, masonry = false, index = 0, className, eager }: AlbumCardProps) {
  const { user, openAuth, revalidateAll } = useAuth();
  const { toast } = useToast();
  const [favorited, setFavorited] = useState(album.favorited);
  const [favCount, setFavCount] = useState(album.favCount);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setFavorited(album.favorited);
    setFavCount(album.favCount);
  }, [album.favorited, album.favCount]);

  const toggleFavorite = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      openAuth('login');
      return;
    }
    if (pending) {
      return;
    }
    setPending(true);
    const next = !favorited;
    setFavorited(next);
    setFavCount((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      const result = await apiFetch<{ favorited: boolean; favCount: number }>(
        `/api/albums/${album.id}/favorite`,
        { method: 'POST' },
      );
      setFavorited(result.favorited);
      setFavCount(result.favCount);
      void revalidateAll();
    } catch (error) {
      setFavorited(!next);
      setFavCount(album.favCount);
      toast(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setPending(false);
    }
  };

  const height = MASONRY_HEIGHTS[index % MASONRY_HEIGHTS.length] ?? 340;

  return (
    <Link
      href={`/albums/${album.id}`}
      className={cn(
        'group block overflow-hidden rounded-[14px] border border-line bg-panel panel-hover',
        masonry && 'mb-0',
        className,
      )}
    >
      <div
        className={cn('relative overflow-hidden bg-[#1c1c22]', !masonry && 'aspect-[3/4]')}
        style={masonry ? { height } : undefined}
      >
        <CoverImage src={album.coverUrl} alt={album.title} eager={eager} fallback="希" />
        <div className="absolute right-2 top-2 flex gap-1">
          <span className="pill">{album.imageCount}P</span>
          {album.videoCount > 0 ? <span className="pill pill-video">{album.videoCount}V</span> : null}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
      </div>
      <div className="flex flex-col px-3 pb-2.5 pt-2">
        <p className="clamp-2 min-h-[38px] text-[13.5px] leading-[1.42] text-[#e6e6e9] transition group-hover:text-white">
          {album.title}
        </p>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-t3">
          <AuthorAvatar
            name={album.author.name}
            initial={album.author.initial}
            color={album.author.color}
            avatarUrl={album.author.avatarUrl}
            size={21}
          />
          <span className="truncate text-t2">{album.author.name}</span>
          <button
            type="button"
            onClick={toggleFavorite}
            className={cn(
              'ml-auto inline-flex shrink-0 items-center gap-1 rounded px-0.5 py-0.5 transition hover:text-brand2',
              favorited && 'text-brand2',
            )}
            aria-label={favorited ? '取消收藏' : '收藏'}
            aria-pressed={favorited}
          >
            <Star size={13} fill={favorited ? 'currentColor' : 'none'} />
            <span className="tabular-nums">{formatCount(favCount)}</span>
          </button>
        </div>
      </div>
    </Link>
  );
}
