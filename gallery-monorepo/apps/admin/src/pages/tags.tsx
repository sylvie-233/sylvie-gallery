import { useState } from 'react';
import useSWR from 'swr';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import type { AdminTagRow, PageResult } from '@sylvie/types';

import {
  Badge,
  Empty,
  LoadingRows,
  Modal,
  PageError,
  PageHead,
  Pagination,
  SearchBox,
  Tabs,
} from '@/components/ui';
import { adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { formatDate } from '@/lib/date';
import { useToast } from '@/lib/toast';

type TagFilter = 'all' | 'on' | 'off';

const TAB_ITEMS: Array<{ value: TagFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'on', label: '展示中' },
  { value: 'off', label: '已隐藏' },
];

export function TagsPage() {
  const { token, revalidateAll } = useAdminAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [filter, setFilter] = useState<TagFilter>('all');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminTagRow | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '8');
  if (filter !== 'all') params.set('status', filter);
  if (keyword) params.set('keyword', keyword);

  const { data, error, isLoading, mutate } = useSWR<PageResult<AdminTagRow>>(
    token ? [`/tags?${params.toString()}`, token] : null,
    () => adminFetch<PageResult<AdminTagRow>>(`/tags?${params.toString()}`),
  );
  const { data: allCount } = useSWR<PageResult<AdminTagRow>>(
    token ? ['/tags?status=all&pageSize=1', token] : null,
    () => adminFetch<PageResult<AdminTagRow>>('/tags?status=all&pageSize=1'),
  );
  const { data: onCount } = useSWR<PageResult<AdminTagRow>>(
    token ? ['/tags?status=on&pageSize=1', token] : null,
    () => adminFetch<PageResult<AdminTagRow>>('/tags?status=on&pageSize=1'),
  );

  const switchFilter = (next: TagFilter) => {
    setFilter(next);
    setPage(1);
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setModalOpen(true);
  };

  const openEdit = (tag: AdminTagRow) => {
    setEditing(tag);
    setName(tag.name);
    setModalOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast('请输入标签名', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await adminFetch(`/tags/${editing.id}`, { method: 'PUT', body: { name: name.trim() } });
        toast('标签已更新', 'success');
      } else {
        await adminFetch('/tags', { method: 'POST', body: { name: name.trim() } });
        toast('标签已创建', 'success');
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

  const toggle = async (tag: AdminTagRow) => {
    const next = tag.status === 1 ? '隐藏' : '展示';
    const ok = await confirm({
      title: `${next}该标签？`,
      text:
        next === '隐藏'
          ? `隐藏后前台标签云不再展示 #${tag.name}，图集编辑器下拉中也不可选。`
          : `恢复后 #${tag.name} 将重新出现在前台标签云与编辑器下拉中。`,
      okText: next,
    });
    if (!ok) return;
    try {
      await adminFetch(`/tags/${tag.id}/toggle`, { method: 'POST' });
      toast(`标签已${next}`, 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '操作失败', 'error');
    }
  };

  const remove = async (tag: AdminTagRow) => {
    if (tag.useCount > 0) {
      toast(`已被 ${tag.useCount} 套图集收录，不可删除，可先隐藏`, 'error');
      return;
    }
    const ok = await confirm({
      title: '删除该标签？',
      text: `#${tag.name} 当前未被任何图集收录，删除后不可恢复。`,
      okText: '删除',
    });
    if (!ok) return;
    try {
      await adminFetch(`/tags/${tag.id}`, { method: 'DELETE' });
      toast('标签已删除', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '删除失败', 'error');
    }
  };

  return (
    <div>
      <PageHead
        title="标签管理"
        sub={`共 ${allCount?.total ?? data?.total ?? 0} 个 · 展示中 ${onCount?.total ?? 0} 个`}
      >
        <button type="button" className="btn btn-red" onClick={openCreate}>
          <Plus size={15} />
          新建标签
        </button>
      </PageHead>

      <div className="panel">
        <div className="toolbar">
          <Tabs items={TAB_ITEMS} value={filter} onChange={switchFilter} />
          <div className="sp" />
          <SearchBox
            value={keywordInput}
            onChange={setKeywordInput}
            onSearch={() => {
              setKeyword(keywordInput.trim());
              setPage(1);
            }}
            placeholder="搜索标签名"
          />
        </div>

        {isLoading && !data ? (
          <LoadingRows />
        ) : error && !data ? (
          <PageError message="标签加载失败" onRetry={() => mutate()} />
        ) : data && data.list.length > 0 ? (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>标签</th>
                  <th>收录套数</th>
                  <th className="hide-m">创建时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.list.map((tag) => (
                  <tr key={tag.id}>
                    <td className="text-[13px] text-brand2">#{tag.name}</td>
                    <td className="text-[12.5px] tabular-nums text-t2">{tag.useCount}</td>
                    <td className="hide-m text-[12px] tabular-nums text-t3">
                      {formatDate(tag.createdAt)}
                    </td>
                    <td>
                      {tag.status === 1 ? (
                        <Badge tone="green">展示中</Badge>
                      ) : (
                        <Badge tone="red">已隐藏</Badge>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-t1"
                          onClick={() => openEdit(tag)}
                        >
                          <Pencil size={11} />
                          编辑
                        </button>
                        <button
                          type="button"
                          className="rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-brand2"
                          onClick={() => toggle(tag)}
                        >
                          {tag.status === 1 ? '隐藏' : '展示'}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-[#ff8194]"
                          onClick={() => remove(tag)}
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
          <Empty title="没有符合条件的标签" text="换个筛选条件试试，或点击右上角新建标签。" />
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editing ? `编辑标签 #${editing.id}` : '新建标签'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-line" onClick={() => setModalOpen(false)}>
              取消
            </button>
            <button type="button" className="btn btn-red" onClick={save} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <div className="field">
          <label>
            标签名 <i>*</i>
          </label>
          <input
            value={name}
            maxLength={20}
            onChange={(event) => setName(event.target.value)}
            placeholder="1-20 个字符，如：日系"
            autoFocus
          />
          <p className="mt-2 text-[11.5px] text-t3">
            列表统一以 # 前缀展示；重命名后所有已收录图集的标签同步更新。
          </p>
        </div>
      </Modal>
    </div>
  );
}
