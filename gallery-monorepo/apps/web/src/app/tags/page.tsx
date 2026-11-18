'use client';

import Link from 'next/link';
import useSWR from 'swr';

import type { TagDto } from '@sylvie/types';
import { cn } from '@sylvie/utils';

import { EmptyState } from '@/components/empty-state';
import { apiFetch } from '@/lib/api';

const SIZE_CLASSES = [
  'text-[13px]',
  'text-[14px]',
  'text-[16px] text-[#d8d8dd]',
  'text-[18px] font-semibold text-[#ededf0]',
  'text-[21px] font-bold text-white',
];

export default function TagsPage() {
  const { data, error, isLoading, mutate } = useSWR<TagDto[]>('/tags', () =>
    apiFetch<TagDto[]>('/api/tags'),
  );

  const maxCount = Math.max(1, ...(data ?? []).map((tag) => tag.useCount));

  return (
    <div className="wrap">
      <div className="mb-4">
        <h1 className="page-title">标签</h1>
        <p className="mt-1.5 text-[13px] text-t3">
          收录 {data?.length ?? 0} 个标签 · 字号按收录套数分级
        </p>
      </div>

      {isLoading && !data ? (
        <div className="skeleton h-52 w-full" />
      ) : error && !data ? (
        <div className="panel px-6 py-14 text-center">
          <p className="text-t2">标签加载失败</p>
          <button type="button" className="btn btn-outline mt-4" onClick={() => mutate()}>
            重新加载
          </button>
        </div>
      ) : data && data.length > 0 ? (
        <div className="panel flex flex-wrap gap-2.5 p-5 sm:p-6">
          {data.map((tag) => {
            const level = Math.max(1, Math.min(5, Math.ceil((tag.useCount / maxCount) * 5)));
            return (
              <Link
                key={tag.id}
                href={`/albums?tag=${encodeURIComponent(tag.name)}`}
                className={cn(
                  'rounded-full border border-line bg-panel2 px-4 py-1.5 leading-tight text-t2 transition hover:border-brand/45 hover:bg-brand-dim hover:text-white',
                  SIZE_CLASSES[level - 1],
                )}
              >
                #{tag.name}
                <span className="ml-1.5 text-[10.5px] opacity-55 tabular-nums">{tag.useCount}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <EmptyState title="暂无标签" text="管理员发布图集后，标签会展示在这里。" />
        </div>
      )}

      <p className="mt-5 text-[12px] leading-relaxed text-t3">
        标签由管理员在发布图集时维护。点击任意标签可进入对应的图集筛选结果页。
      </p>
    </div>
  );
}
