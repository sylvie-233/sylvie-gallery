import { useState } from 'react';
import useSWR from 'swr';
import { Check, ExternalLink, Trash2, X } from 'lucide-react';

import type { AdminCommentRow, PageResult } from '@sylvie/types';
import { cn } from '@sylvie/utils';

import {
  AvatarBox,
  Badge,
  Empty,
  LoadingRows,
  PageError,
  PageHead,
  Pagination,
  SearchBox,
  Tabs,
  TimeRangePicker,
} from '@/components/ui';
import { adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { formatDateTime, rangeQuery, type TimeRange } from '@/lib/date';
import { useToast } from '@/lib/toast';

type CommentTab = 'pending' | 'approved' | 'rejected';

const TAB_ITEMS: Array<{ value: CommentTab; label: string }> = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
];

const FRONT_URL = import.meta.env.VITE_WEB_URL ?? 'http://localhost:3001';

const EMPTY_TEXT: Record<CommentTab, string> = {
  pending: '没有待审核的评论',
  approved: '没有已通过的评论',
  rejected: '没有已拒绝的评论',
};

function roleBadge(role: string) {
  if (role === 'vip') return <Badge tone="amber">付费会员</Badge>;
  if (role === 'admin') return <Badge tone="blue">管理员</Badge>;
  return <Badge tone="gray">注册会员</Badge>;
}

export function CommentsPage() {
  const { token, revalidateAll } = useAdminAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [tab, setTab] = useState<CommentTab>('pending');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<TimeRange>({ quick: 'all', from: '', to: '' });

  const params = new URLSearchParams();
  params.set('status', tab);
  params.set('page', String(page));
  params.set('pageSize', '5');
  if (keyword) params.set('keyword', keyword);
  const rangeParams = rangeQuery(range);
  if (rangeParams) {
    new URLSearchParams(rangeParams).forEach((value, key) => params.set(key, value));
  }

  const { data, error, isLoading, mutate } = useSWR<PageResult<AdminCommentRow>>(
    token ? [`/comments?${params.toString()}`, token] : null,
    () => adminFetch<PageResult<AdminCommentRow>>(`/comments?${params.toString()}`),
  );

  const switchTab = (next: CommentTab) => {
    setTab(next);
    setPage(1);
  };

  const changeRange = (next: TimeRange) => {
    setRange(next);
    setPage(1);
  };

  const doSearch = () => {
    setKeyword(keywordInput.trim());
    setPage(1);
  };

  const review = async (comment: AdminCommentRow, status: 'approved' | 'rejected') => {
    const ok = await confirm({
      title: status === 'approved' ? '通过该评论？' : '拒绝该评论？',
      text:
        status === 'approved'
          ? `通过后评论将在前台《${comment.albumTitle}》展示。`
          : '拒绝后该评论不会在前台展示，用户会收到审核未通过通知。',
      okText: status === 'approved' ? '通过' : '拒绝',
    });
    if (!ok) return;
    try {
      await adminFetch(`/comments/${comment.id}/review`, {
        method: 'POST',
        body: { status },
      });
      toast(status === 'approved' ? '评论已通过' : '评论已拒绝', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '操作失败', 'error');
    }
  };

  const remove = async (comment: AdminCommentRow) => {
    const ok = await confirm({
      title: '删除该评论？',
      text: '删除后不可恢复，若为一级评论其下回复也会一并删除。',
      okText: '删除',
    });
    if (!ok) return;
    try {
      await adminFetch(`/comments/${comment.id}`, { method: 'DELETE' });
      toast('评论已删除', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '删除失败', 'error');
    }
  };

  return (
    <div>
      <PageHead
        title="评论审核"
        sub={
          data ? `共 ${data.total} 条 · 第 ${data.page} / ${data.totalPages} 页` : '评论区先审后发'
        }
      />

      <div className="panel">
        <div className="toolbar">
          <Tabs items={TAB_ITEMS} value={tab} onChange={switchTab} />
          <div className="sp" />
          <SearchBox
            value={keywordInput}
            onChange={setKeywordInput}
            onSearch={doSearch}
            placeholder="搜索用户 / 内容 / 图集"
          />
        </div>
        <div className="toolbar">
          <TimeRangePicker value={range} onChange={changeRange} />
        </div>

        {isLoading && !data ? (
          <LoadingRows rows={4} />
        ) : error && !data ? (
          <PageError message="评论加载失败" onRetry={() => mutate()} />
        ) : data && data.list.length > 0 ? (
          <>
            <div>
              {data.list.map((comment) => (
                <div
                  key={comment.id}
                  className="flex gap-4 border-b border-line px-4 py-4 transition last:border-b-0 hover:bg-[#17171c]"
                >
                  <AvatarBox
                    name={comment.user.nickname}
                    avatarUrl={comment.user.avatarUrl}
                    initial={comment.user.nickname.slice(0, 1)}
                    color="#8e7cff"
                    size={36}
                    rounded={18}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-[13px] font-semibold">{comment.user.nickname}</b>
                      {roleBadge(comment.user.role)}
                      <a
                        href={`${FRONT_URL}/albums/${comment.albumId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-[360px] items-center gap-1 truncate text-[11.5px] text-t3 transition hover:text-brand2"
                      >
                        《{comment.albumTitle}》
                        <ExternalLink size={10} />
                      </a>
                      <span className="text-[11.5px] text-t3">
                        {formatDateTime(comment.createdAt)}
                      </span>
                      {comment.parentId ? <Badge tone="gray">回复</Badge> : null}
                    </div>
                    <p className="mt-2 whitespace-pre-line break-words text-[13.5px] leading-relaxed text-[#dcdce1]">
                      {comment.replyToName ? (
                        <span className="mr-1 text-[12px] text-t3">
                          回复 @{comment.replyToName}：
                        </span>
                      ) : null}
                      {comment.content}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-2 pt-0.5">
                    {comment.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-green btn-sm"
                          onClick={() => review(comment, 'approved')}
                        >
                          <Check size={12} />
                          通过
                        </button>
                        <button
                          type="button"
                          className="btn btn-line btn-sm"
                          onClick={() => review(comment, 'rejected')}
                        >
                          <X size={12} />
                          拒绝
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          className={cn(
                            'badge',
                            comment.status === 'approved' ? 'badge-green' : 'badge-red',
                          )}
                        >
                          {comment.status === 'approved' ? '已通过' : '已拒绝'}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger-line shrink-0"
                          onClick={() => remove(comment)}
                        >
                          <Trash2 size={12} />
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        ) : (
          <Empty
            title={keyword || range.quick !== 'all' ? '没有匹配的评论' : EMPTY_TEXT[tab]}
            text={
              keyword || range.quick !== 'all'
                ? '换个关键词或时间范围试试。'
                : '新的评论提交后会出现在这里。'
            }
          />
        )}
      </div>
    </div>
  );
}
