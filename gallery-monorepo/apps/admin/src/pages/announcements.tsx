import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import type {
  AdminAnnouncementInput,
  AdminAnnouncementRow,
  AnnouncementType,
  PageResult,
} from '@sylvie/types';

import {
  Badge,
  Empty,
  LoadingRows,
  Modal,
  PageError,
  PageHead,
  Pagination,
  SearchBox,
  TimeRangePicker,
} from '@/components/ui';
import { adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { formatDate, rangeQuery, type TimeRange } from '@/lib/date';
import { useToast } from '@/lib/toast';

const TYPE_OPTIONS: Array<{ value: AnnouncementType; label: string }> = [
  { value: 'update', label: '更新' },
  { value: 'activity', label: '活动' },
  { value: 'maintain', label: '维护' },
  { value: 'rule', label: '规则' },
  { value: 'notice', label: '通知' },
];

const TYPE_BADGE: Record<AnnouncementType, 'gray' | 'brand' | 'amber' | 'blue' | 'green'> = {
  update: 'gray',
  activity: 'brand',
  maintain: 'amber',
  rule: 'gray',
  notice: 'blue',
};

interface NoticeForm {
  type: AnnouncementType;
  title: string;
  summary: string;
  content: string;
  isTop: boolean;
}

const EMPTY_FORM: NoticeForm = {
  type: 'notice',
  title: '',
  summary: '',
  content: '',
  isTop: false,
};

export function AnnouncementsPage() {
  const { token, revalidateAll } = useAdminAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<TimeRange>({ quick: 'all', from: '', to: '' });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<NoticeForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '6');
  if (type !== 'all') params.set('type', type);
  if (status !== 'all') params.set('status', status);
  if (keyword) params.set('keyword', keyword);
  const rangeParams = rangeQuery(range);
  if (rangeParams) {
    new URLSearchParams(rangeParams).forEach((value, key) => params.set(key, value));
  }

  const { data, error, isLoading, mutate } = useSWR<PageResult<AdminAnnouncementRow>>(
    token ? [`/announcements?${params.toString()}`, token] : null,
    () => adminFetch<PageResult<AdminAnnouncementRow>>(`/announcements?${params.toString()}`),
  );

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreate();
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const resetPage = () => setPage(1);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (row: AdminAnnouncementRow) => {
    setEditingId(row.id);
    setForm({
      type: row.type,
      title: row.title,
      summary: row.summary ?? '',
      content: row.content ?? '',
      isTop: row.isTop,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast('请输入公告标题', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: AdminAnnouncementInput = {
        type: form.type,
        title: form.title.trim(),
        summary: form.summary.trim(),
        content: form.content.trim(),
        isTop: form.isTop,
      };
      if (editingId) {
        await adminFetch(`/announcements/${editingId}`, { method: 'PUT', body: payload });
        toast('公告已更新', 'success');
      } else {
        await adminFetch('/announcements', { method: 'POST', body: payload });
        toast('公告已发布', 'success');
        setPage(1);
      }
      setModalOpen(false);
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (row: AdminAnnouncementRow) => {
    const next = row.status === 1 ? '下线' : '发布';
    const ok = await confirm({
      title: `${next}该公告？`,
      text: `《${row.title}》将${next === '下线' ? '从前台公告列表移除' : '立即在前台展示'}。`,
      okText: next,
    });
    if (!ok) return;
    try {
      await adminFetch(`/announcements/${row.id}/toggle`, { method: 'POST' });
      toast(`公告已${next}`, 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '操作失败', 'error');
    }
  };

  const remove = async (row: AdminAnnouncementRow) => {
    const ok = await confirm({
      title: '删除该公告？',
      text: `《${row.title}》将被删除且不可恢复。`,
      okText: '删除',
    });
    if (!ok) return;
    try {
      await adminFetch(`/announcements/${row.id}`, { method: 'DELETE' });
      toast('公告已删除', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '删除失败', 'error');
    }
  };

  return (
    <div>
      <PageHead
        title="公告管理"
        sub={data ? `共 ${data.total} 条 · 置顶公告排首位` : ''}
      >
        <button type="button" className="btn btn-red" onClick={openCreate}>
          <Plus size={15} />
          新建公告
        </button>
      </PageHead>

      <div className="panel">
        <div className="toolbar">
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              resetPage();
            }}
            className="h-9"
          >
            <option value="all">全部类型</option>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              resetPage();
            }}
            className="h-9"
          >
            <option value="all">全部状态</option>
            <option value="1">已发布</option>
            <option value="0">已下线</option>
          </select>
          <div className="sp" />
          <SearchBox
            value={keywordInput}
            onChange={setKeywordInput}
            onSearch={() => {
              setKeyword(keywordInput.trim());
              resetPage();
            }}
            placeholder="搜索标题 / 摘要 / 正文"
          />
        </div>
        <div className="toolbar">
          <TimeRangePicker
            value={range}
            onChange={(next) => {
              setRange(next);
              resetPage();
            }}
          />
        </div>

        {isLoading && !data ? (
          <LoadingRows />
        ) : error && !data ? (
          <PageError message="公告加载失败" onRetry={() => mutate()} />
        ) : data && data.list.length > 0 ? (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>类型</th>
                  <th className="hide-m">摘要</th>
                  <th>发布时间</th>
                  <th className="hide-m">状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.list.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        {row.isTop ? <Badge tone="brand">置顶</Badge> : null}
                        <span className="max-w-[320px] truncate text-[13px]">{row.title}</span>
                      </div>
                    </td>
                    <td>
                      <Badge tone={TYPE_BADGE[row.type]}>{row.typeLabel}</Badge>
                    </td>
                    <td className="hide-m max-w-[280px] truncate text-[12.5px] text-t3">
                      {row.summary ?? '—'}
                    </td>
                    <td className="text-[12px] tabular-nums text-t3">{formatDate(row.publishedAt)}</td>
                    <td className="hide-m">
                      {row.status === 1 ? (
                        <Badge tone="green">已发布</Badge>
                      ) : (
                        <Badge tone="red">已下线</Badge>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-t1"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil size={11} />
                          编辑
                        </button>
                        <button
                          type="button"
                          className="rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-brand2"
                          onClick={() => toggle(row)}
                        >
                          {row.status === 1 ? '下线' : '发布'}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-[#ff8194]"
                          onClick={() => remove(row)}
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
          <Empty
            title={keyword || type !== 'all' || status !== 'all' || range.quick !== 'all' ? '没有符合条件的公告' : '没有公告'}
            text="点击右上角「新建公告」发布第一条。"
          />
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editingId ? `编辑公告 #${editingId}` : '新建公告'}
        onClose={() => setModalOpen(false)}
        width={620}
        footer={
          <>
            <button type="button" className="btn btn-line" onClick={() => setModalOpen(false)}>
              取消
            </button>
            <button type="button" className="btn btn-red" onClick={save} disabled={saving}>
              {saving ? '保存中…' : editingId ? '保存修改' : '发布公告'}
            </button>
          </>
        }
      >
        <div className="frow">
          <div className="field">
            <label>类型</label>
            <select
              value={form.type}
              onChange={(event) =>
                setForm((value) => ({ ...value, type: event.target.value as AnnouncementType }))
              }
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>置顶</label>
            <div className="flex h-[38px] items-center gap-2.5">
              <button
                type="button"
                className={`switch ${form.isTop ? 'on' : ''}`}
                onClick={() => setForm((value) => ({ ...value, isTop: !value.isTop }))}
                aria-label="置顶开关"
              />
              <span className="text-[12.5px] text-t3">
                {form.isTop ? '置顶排列表首位' : '普通排序'}
              </span>
            </div>
          </div>
        </div>
        <div className="field">
          <label>
            标题 <i>*</i>
          </label>
          <input
            value={form.title}
            maxLength={128}
            onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
            placeholder="公告标题"
          />
        </div>
        <div className="field">
          <label>摘要</label>
          <input
            value={form.summary}
            maxLength={255}
            onChange={(event) => setForm((value) => ({ ...value, summary: event.target.value }))}
            placeholder="列表展示的一句话摘要"
          />
        </div>
        <div className="field">
          <label>正文（空行分段）</label>
          <textarea
            value={form.content}
            onChange={(event) => setForm((value) => ({ ...value, content: event.target.value }))}
            placeholder="第一段…&#10;&#10;第二段…"
            style={{ minHeight: 140 }}
          />
        </div>
      </Modal>
    </div>
  );
}
