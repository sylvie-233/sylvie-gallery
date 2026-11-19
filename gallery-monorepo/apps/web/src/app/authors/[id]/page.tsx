'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { Bell, ChevronDown, ChevronLeft, ChevronUp } from 'lucide-react';

import type { AuthorDetailDto } from '@sylvie/types';
import { formatDate } from '@sylvie/utils';
import { EmptyState, Pagination, AuthorDetailSkeleton } from '@sylvie/ui/web';

import { AlbumCard } from '@/components/album-card';
import { apiFetch } from '@/lib/api';
import { useAuth, revalidateAll } from '@/lib/auth';
import { useToast } from '@/lib/toast';

export default function AuthorDetailPage() {
  const params = useParams<{ id: string }>();
  const authorId = Number(params.id);
  const { token, user, openAuth } = useAuth();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<AuthorDetailDto>(
    Number.isFinite(authorId) ? [`/authors/${authorId}`, page, token ?? 'guest'] : null,
    () => apiFetch<AuthorDetailDto>(`/api/authors/${authorId}?page=${page}&pageSize=12`),
  );

  if (isLoading && !data) {
    return <AuthorDetailSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="wrap">
        <div className="panel px-6 py-16 text-center">
          <p className="text-t2">作者信息加载失败</p>
          <button type="button" className="btn btn-outline mt-4" onClick={() => mutate()}>
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { author } = data;
  const longBio = (author.bio?.length ?? 0) > 90;

  const toggleSubscribe = async () => {
    if (!user) {
      openAuth('login');
      return;
    }
    if (pending) {
      return;
    }
    setPending(true);
    try {
      const result = await apiFetch<{ subscribed: boolean }>(
        `/api/authors/${author.id}/subscribe`,
        { method: 'POST' },
      );
      toast(result.subscribed ? '已订阅该作者' : '已取消订阅', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '操作失败', 'error');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="wrap">
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-t3">
        <Link href="/" className="transition hover:text-brand2">
          首页
        </Link>
        <span>/</span>
        <Link href="/authors" className="transition hover:text-brand2">
          个人写真
        </Link>
        <span>/</span>
        <span className="text-t2">{author.name}</span>
      </div>

      <section className="panel mb-7 p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-line">
            {author.avatarUrl ? (
              <img src={author.avatarUrl} alt={author.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-3xl font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${author.color}, ${author.color}99)` }}
              >
                {author.initial}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[22px] font-extrabold text-brand2">{author.name}</h1>
              <button
                type="button"
                className={author.subscribed ? 'btn btn-outline btn-sm' : 'btn btn-outline btn-sm chip-amber'}
                onClick={toggleSubscribe}
                disabled={pending}
              >
                <Bell size={13} />
                {author.subscribed ? '已订阅' : '订阅'}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-t3">
              <span>
                收录 {author.albumCount} 套 · 当前可下载 {author.albumCount} 套
              </span>
              <span>最近更新 {formatDate(author.lastUpdateAt)}</span>
              {author.alias ? <span>别名：{author.alias}</span> : null}
            </div>

            <p className="mt-3 text-[12.5px] leading-relaxed text-t3">
              其中 {author.albumCount} 套提供原图/视频压缩包；积分解锁后可在线查看全部并下载，付费会员全站畅看。
            </p>

            {author.bio ? (
              <div className="mt-3">
                <p
                  className={
                    expanded
                      ? 'text-[13px] leading-[1.9] text-t2'
                      : 'clamp-3 text-[13px] leading-[1.9] text-t2'
                  }
                >
                  {author.bio}
                </p>
                {longBio || !expanded ? (
                  <button
                    type="button"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-t3 transition hover:text-brand2"
                    onClick={() => setExpanded((value) => !value)}
                  >
                    {expanded ? (
                      <>
                        收起 <ChevronUp size={13} />
                      </>
                    ) : (
                      <>
                        展开更多 <ChevronDown size={13} />
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mb-3.5 flex items-center gap-2.5">
        <h2 className="section-title text-brand">相关图集</h2>
        <span className="text-xs text-t3">共 {data.albumTotal} 套</span>
        <Link
          href="/authors"
          className="ml-auto inline-flex items-center gap-1 text-xs text-t3 transition hover:text-brand2"
        >
          <ChevronLeft size={13} />
          返回作者列表
        </Link>
      </div>

      {data.albums.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {data.albums.map((album, index) => (
              <AlbumCard key={album.id} album={album} index={index} eager={index < 5} />
            ))}
          </div>
          <Pagination
            page={data.albumPage}
            totalPages={data.albumTotalPages}
            onChange={(nextPage) => {
              setPage(nextPage);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      ) : (
        <div className="panel">
          <EmptyState title="该作者暂时没有公开图集" text="稍后再来看看吧。" />
        </div>
      )}
    </div>
  );
}
