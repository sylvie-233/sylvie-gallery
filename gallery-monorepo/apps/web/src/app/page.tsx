'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';

import type { AnnouncementDto } from '@sylvie/types';
import { formatDate } from '@sylvie/utils';
import { SectionHead, HomeSkeleton } from '@sylvie/ui/web';

import { AlbumCard } from '@/components/album-card';
import { AnnouncementModal } from '@/components/announcement-modal';
import { AuthorCard } from '@/components/author-card';
import { useBootstrap } from '@/lib/hooks';

export default function HomePage() {
  const { data, error, isLoading, mutate } = useBootstrap();
  const [activeAnnouncement, setActiveAnnouncement] = useState<AnnouncementDto | null>(null);

  if (isLoading && !data) {
    return <HomeSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="wrap">
        <div className="panel p-10 text-center">
          <p className="text-t2">首页数据加载失败</p>
          <p className="mt-2 text-xs text-t3">
            {error instanceof Error ? error.message : '请检查 API 服务是否已启动'}
          </p>
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

  return (
    <div className="wrap">
      <section className="mb-9">
        <SectionHead
          title="最近更新"
          sub={`今日新增 ${data.todayAdded} 套${data.latestDate ? ` · 最近更新 ${data.latestDate}` : ''}`}
          href="/albums"
        />
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {data.latestAlbums.map((album, index) => (
            <AlbumCard key={album.id} album={album} index={index} eager={index < 6} />
          ))}
        </div>
        {data.latestAlbums.length === 0 ? (
          <div className="panel px-6 py-14 text-center text-[13px] text-t3">暂时还没有图集</div>
        ) : null}
      </section>

      <section className="mb-9">
        <SectionHead title="个人写真" red href="/authors" linkText="查看全部" />
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
          {data.authors.map((author) => (
            <AuthorCard key={author.id} author={author} />
          ))}
        </div>
      </section>

      <section className="mb-4">
        <SectionHead title="公告" href="/announcements" linkText="全部公告" />
        <div className="panel overflow-hidden">
          {data.announcements.map((announcement) => (
            <button
              key={announcement.id}
              type="button"
              className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left transition last:border-b-0 hover:bg-panel2"
              onClick={() => setActiveAnnouncement(announcement)}
            >
              {announcement.isTop ? (
                <span className="shrink-0 rounded bg-brand-dim px-2 py-1 text-[11px] text-brand2">
                  置顶
                </span>
              ) : null}
              <span className="shrink-0 rounded bg-white/[0.06] px-2 py-1 text-[11px] text-t2">
                {announcement.typeLabel}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-t1">
                {announcement.title}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-t3">
                {formatDate(announcement.publishedAt)}
              </span>
            </button>
          ))}
          {data.announcements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-t3">
              <Bell size={20} />
              <span className="text-[13px]">暂无公告</span>
            </div>
          ) : null}
        </div>
      </section>

      <p className="mt-6 text-center text-[11.5px] text-t3">
        {data.stats.albumCount} 套图集 · {data.stats.imageCount} 张图片 · 所有图集均由管理员统一发布
      </p>

      <AnnouncementModal
        announcement={activeAnnouncement}
        onClose={() => setActiveAnnouncement(null)}
      />
    </div>
  );
}
