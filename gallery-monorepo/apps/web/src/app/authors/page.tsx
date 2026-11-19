'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Search } from 'lucide-react';

import type { AuthorDto } from '@sylvie/types';
import { EmptyState, AuthorGridSkeleton } from '@sylvie/ui/web';

import { AuthorCard } from '@/components/author-card';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AuthorsPage() {
  const { token } = useAuth();
  const [keyword, setKeyword] = useState('');
  const { data, error, isLoading, mutate } = useSWR<AuthorDto[]>(
    ['/authors', token ?? 'guest'],
    () => apiFetch<AuthorDto[]>('/api/authors'),
  );

  const filtered = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    if (!term || !data) {
      return data ?? [];
    }
    return data.filter((author) => {
      const haystack = [author.name, author.alias ?? '', ...author.styleTags]
        .join('\n')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [data, keyword]);

  return (
    <div className="wrap">
      <div className="mb-4">
        <h1 className="page-title">个人写真</h1>
        <p className="mt-1.5 text-[13px] text-t3">图集作者 · 写真本人 · 点击进入作者主页</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex w-full max-w-[340px] items-center gap-2 rounded-[10px] border border-line bg-panel px-3.5 py-2.5 transition focus-within:border-brand/50 focus-within:bg-[#16161a]">
          <Search size={15} className="shrink-0 text-t3" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索作者名 / 别名"
            className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-t3"
          />
        </div>
        <span className="ml-auto text-xs text-t3">共 {filtered.length} 位作者</span>
      </div>

      {isLoading && !data ? (
        <AuthorGridSkeleton count={7} />
      ) : error && !data ? (
        <div className="panel px-6 py-14 text-center">
          <p className="text-t2">作者列表加载失败</p>
          <button type="button" className="btn btn-outline mt-4" onClick={() => mutate()}>
            重新加载
          </button>
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
          {filtered.map((author) => (
            <AuthorCard key={author.id} author={author} />
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            title="没有找到这位作者"
            text="换个名字或别名试试。"
            action={
              <button type="button" className="btn btn-outline" onClick={() => setKeyword('')}>
                清空搜索
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}
