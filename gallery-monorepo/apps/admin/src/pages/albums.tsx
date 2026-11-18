import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';

import type { AdminAlbumRow, AdminAlbumStatus, PageResult } from '@sylvie/types';
import { formatCount } from '@sylvie/utils';

import {
  AlbumStatusBadge,
  Badge,
  Empty,
  LoadingRows,
  PageError,
  PageHead,
  Pagination,
  SearchBox,
  Tabs,
} from '@/components/ui';
import { adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { formatDateTime } from '@/lib/date';
import { useToast } from '@/lib/toast';

type StatusFilter = 'all' | AdminAlbumStatus;

const STATUS_ITEMS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'offline', label: '已下架' },
];

export function AlbumsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, revalidateAll } = useAdminAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const statusParam = searchParams.get('status');
  const status: StatusFilter =
    statusParam === 'published' || statusParam === 'draft' || statusParam === 'offline'
      ? statusParam
      : 'all';

  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '6');
  if (status !== 'all') params.set('status', status);
  if (keyword) params.set('keyword', keyword);

  const { data, error, isLoading, mutate } = useSWR<PageResult<AdminAlbumRow>>(
    token ? [`/albums?${params.toString()}`, token] : null,
    () => adminFetch<PageResult<AdminAlbumRow>>(`/albums?${params.toString()}`),
  );

  useEffect(() => {
    if (data && data.list.length === 0 && page > 1) {
      setPage((value) => Math.max(1, value - 1));
    }
  }, [data, page]);

  const changeStatus = (next: StatusFilter) => {
    setPage(1);
    const paramsNext = new URLSearchParams(searchParams);
    if (next === 'all') paramsNext.delete('status');
    else paramsNext.set('status', next);
    setSearchParams(paramsNext);
  };

  const doSearch = () => {
    setKeyword(keywordInput.trim());
    setPage(1);
  };

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    try {
      await action();
      toast(successMessage, 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '操作失败', 'error');
    }
  };

  const toggleStatus = async (album: AdminAlbumRow) => {
    const next = album.status === 'published' ? 'offline' : 'published';
    const ok = await confirm({
      title: next === 'published' ? '发布该图集？' : '下架该图集？',
      text:
        next === 'published'
          ? `《${album.title}》将立即在前台展示。`
          : `《${album.title}》下架后前台不再展示，可在后台重新上架。`,
      okText: next === 'published' ? '发布' : '下架',
    });
    if (!ok) return;
    await runAction(
      () =>
        adminFetch(`/albums/${album.id}/status`, {
          method: 'POST',
          body: { status: next },
        }),
      next === 'published' ? '图集已发布' : '图集已下架',
    );
  };

  const toggleRecommend = async (album: AdminAlbumRow) => {
    const ok = await confirm({
      title: album.isRecommended ? '移出推荐池？' : '加入推荐池？',
      text: album.isRecommended
        ? '移出后该图集不再进入瀑布流「个人推荐」候选池。'
        : '加入后该图集将进入瀑布流「个人推荐」候选池。',
      okText: album.isRecommended ? '移出' : '推荐',
    });
    if (!ok) return;
    await runAction(
      () => adminFetch(`/albums/${album.id}/recommend`, { method: 'POST' }),
      album.isRecommended ? '已移出推荐池' : '已加入推荐池',
    );
  };

  const remove = async (album: AdminAlbumRow) => {
    const ok = await confirm({
      title: '删除该图集？',
      text: `《${album.title}》将被软删除，前台不再展示且不可恢复。`,
      okText: '删除',
    });
    if (!ok) return;
    await runAction(
      () => adminFetch(`/albums/${album.id}`, { method: 'DELETE' }),
      '图集已删除',
    );
  };

  return (
    <div>
      <PageHead title="图集管理" sub={data ? `共 ${data.total} 套 · 第 ${data.page} / ${data.totalPages} 页` : ''}>
        <button type="button" className="btn btn-red" onClick={() => navigate('/albums/new')}>
          <Plus size={15} />
          发布图集
        </button>
      </PageHead>

      <div className="panel">
        <div className="toolbar">
          <Tabs items={STATUS_ITEMS} value={status} onChange={changeStatus} />
          <div className="sp" />
          <SearchBox
            value={keywordInput}
            onChange={setKeywordInput}
            onSearch={doSearch}
            placeholder="搜索标题 / 作者"
          />
        </div>

        {isLoading && !data ? (
          <LoadingRows />
        ) : error && !data ? (
          <PageError message="图集列表加载失败" onRetry={() => mutate()} />
        ) : data && data.list.length > 0 ? (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>图集</th>
                  <th>作者</th>
                  <th>规格</th>
                  <th className="hide-m">解锁积分</th>
                  <th className="hide-m">浏览 / 收藏</th>
                  <th className="hide-m">发布时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.list.map((album) => (
                  <tr key={album.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <img
                          src={album.coverUrl}
                          alt={album.title}
                          className="h-12 w-9 shrink-0 rounded-md border border-line object-cover"
                        />
                        <div className="min-w-0">
                          <p className="max-w-[250px] truncate text-[13px]">{album.title}</p>
                          <p className="mt-0.5 text-[11px] text-t3">#{album.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-[12.5px] text-t2">{album.authorName}</td>
                    <td className="text-[12px] text-t3">
                      {album.imageCount}P{album.videoCount > 0 ? ` · ${album.videoCount}V` : ''}
                    </td>
                    <td className="hide-m text-[12px] text-t2">{album.points}</td>
                    <td className="hide-m text-[12px] tabular-nums text-t3">
                      {formatCount(album.viewCount)} / {formatCount(album.favCount)}
                    </td>
                    <td className="hide-m text-[12px] tabular-nums text-t3">
                      {formatDateTime(album.publishedAt ?? album.createdAt)}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <AlbumStatusBadge status={album.status} />
                        {album.isRecommended ? <Badge tone="brand">推荐</Badge> : null}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1">
                        <Link
                          to={`/albums/${album.id}/edit`}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-t1"
                        >
                          <Pencil size={11} />
                          编辑
                        </Link>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-brand2"
                          onClick={() => toggleStatus(album)}
                        >
                          {album.status === 'published' ? '下架' : '发布'}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-brand2"
                          onClick={() => toggleRecommend(album)}
                        >
                          <Star size={11} fill={album.isRecommended ? 'currentColor' : 'none'} />
                          {album.isRecommended ? '取消推荐' : '推荐'}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-[#ff8194]"
                          onClick={() => remove(album)}
                        >
                          <Trash2 size={11} />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        ) : (
          <Empty title="没有符合条件的图集" text="换个筛选条件试试，或点击右上角发布新图集。" />
        )}
      </div>
    </div>
  );
}
