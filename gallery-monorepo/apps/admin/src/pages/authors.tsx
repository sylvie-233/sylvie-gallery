import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Pencil, Plus, Trash2, Upload, X } from 'lucide-react';

import type { AdminAuthorInput, AdminAuthorRow, AdminUploadResult, PageResult } from '@sylvie/types';

import {
  AvatarBox,
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
import { adminFetch, adminUpload } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { formatDate } from '@/lib/date';
import { useToast } from '@/lib/toast';

type AuthorFilter = 'all' | 'on' | 'off';

const TAB_ITEMS: Array<{ value: AuthorFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'on', label: '展示中' },
  { value: 'off', label: '已隐藏' },
];

const COLORS = ['#ff2d55', '#3a8ef0', '#f5a623', '#3fbf62', '#8e7cff', '#ff7a45', '#0ea5a5'];

interface AuthorForm {
  name: string;
  alias: string;
  initial: string;
  color: string;
  avatarUrl: string | null;
  bio: string;
  styleTags: string;
  sortWeight: number;
}

const EMPTY_FORM: AuthorForm = {
  name: '',
  alias: '',
  initial: '',
  color: '#3a3a44',
  avatarUrl: null,
  bio: '',
  styleTags: '',
  sortWeight: 10,
};

export function AuthorsPage() {
  const { token, revalidateAll } = useAdminAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState<AuthorFilter>('all');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAuthorRow | null>(null);
  const [form, setForm] = useState<AuthorForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '6');
  if (filter !== 'all') params.set('status', filter);
  if (keyword) params.set('keyword', keyword);

  const { data, error, isLoading, mutate } = useSWR<PageResult<AdminAuthorRow>>(
    token ? [`/authors?${params.toString()}`, token] : null,
    () => adminFetch<PageResult<AdminAuthorRow>>(`/authors?${params.toString()}`),
  );
  const { data: allCount } = useSWR<PageResult<AdminAuthorRow>>(
    token ? ['/authors?status=all&pageSize=1', token] : null,
    () => adminFetch<PageResult<AdminAuthorRow>>('/authors?status=all&pageSize=1'),
  );
  const { data: onCount } = useSWR<PageResult<AdminAuthorRow>>(
    token ? ['/authors?status=on&pageSize=1', token] : null,
    () => adminFetch<PageResult<AdminAuthorRow>>('/authors?status=on&pageSize=1'),
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#3a3a44' });
    setModalOpen(true);
  };

  const openEdit = (author: AdminAuthorRow) => {
    setEditing(author);
    setForm({
      name: author.name,
      alias: author.alias ?? '',
      initial: author.initial,
      color: author.color,
      avatarUrl: author.avatarUrl,
      bio: author.bio ?? '',
      styleTags: author.styleTags.join(', '),
      sortWeight: author.sortWeight,
    });
    setModalOpen(true);
  };

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('仅支持 jpg / png / webp', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('头像不能超过 5MB', 'error');
      return;
    }
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('kind', 'avatar');
      formData.append('file', file);
      const result = await adminUpload<AdminUploadResult>('/upload', formData);
      setForm((value) => ({ ...value, avatarUrl: result.url }));
      toast('头像已上传', 'success');
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '头像上传失败', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast('请输入作者名', 'error');
      return;
    }
    setSaving(true);
    try {
      const styleTags = form.styleTags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      const payload: AdminAuthorInput = {
        name: form.name.trim(),
        alias: form.alias.trim(),
        initial: form.initial.trim() || form.name.trim().slice(0, 1),
        color: form.color,
        avatarUrl: form.avatarUrl,
        bio: form.bio.trim(),
        styleTags,
        sortWeight: Number(form.sortWeight) || 0,
      };
      if (editing) {
        await adminFetch(`/authors/${editing.id}`, { method: 'PUT', body: payload });
        toast('作者已更新', 'success');
      } else {
        await adminFetch('/authors', { method: 'POST', body: payload });
        toast('作者已创建', 'success');
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

  const toggle = async (author: AdminAuthorRow) => {
    const next = author.status === 1 ? '隐藏' : '展示';
    const ok = await confirm({
      title: `${next}该作者？`,
      text:
        next === '隐藏'
          ? `隐藏后前台作者卡与作者主页不再展示 ${author.name}，图集编辑器的作者下拉也会剔除。`
          : `恢复后 ${author.name} 将重新出现在前台作者列表与编辑器下拉中。`,
      okText: next,
    });
    if (!ok) return;
    try {
      await adminFetch(`/authors/${author.id}/toggle`, { method: 'POST' });
      toast(`作者已${next}`, 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '操作失败', 'error');
    }
  };

  const remove = async (author: AdminAuthorRow) => {
    if (author.albumCount > 0) {
      toast(`该作者名下还有 ${author.albumCount} 套图集，请先转移或删除图集`, 'error');
      return;
    }
    const ok = await confirm({
      title: '删除该作者？',
      text: `${author.name} 名下暂无图集，删除后不可恢复。`,
      okText: '删除',
    });
    if (!ok) return;
    try {
      await adminFetch(`/authors/${author.id}`, { method: 'DELETE' });
      toast('作者已删除', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '删除失败', 'error');
    }
  };

  return (
    <div>
      <PageHead
        title="作者管理"
        sub={`共 ${allCount?.total ?? data?.total ?? 0} 位 · 前台展示 ${onCount?.total ?? 0} 位`}
      >
        <button type="button" className="btn btn-red" onClick={openCreate}>
          <Plus size={15} />
          新建作者
        </button>
      </PageHead>

      <div className="panel">
        <div className="toolbar">
          <Tabs items={TAB_ITEMS} value={filter} onChange={(next) => { setFilter(next); setPage(1); }} />
          <div className="sp" />
          <SearchBox
            value={keywordInput}
            onChange={setKeywordInput}
            onSearch={() => {
              setKeyword(keywordInput.trim());
              setPage(1);
            }}
            placeholder="搜索作者 / 别名 / 风格"
          />
        </div>

        {isLoading && !data ? (
          <LoadingRows />
        ) : error && !data ? (
          <PageError message="作者列表加载失败" onRetry={() => mutate()} />
        ) : data && data.list.length > 0 ? (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>作者</th>
                  <th className="hide-m">别名</th>
                  <th>收录</th>
                  <th className="hide-m">风格</th>
                  <th className="hide-m">排序</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.list.map((author) => (
                  <tr key={author.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <AvatarBox
                          name={author.name}
                          initial={author.initial}
                          color={author.color}
                          avatarUrl={author.avatarUrl}
                          size={36}
                        />
                        <div>
                          <p className="text-[13px]">{author.name}</p>
                          <p className="mt-0.5 text-[11px] text-t3">
                            创建于 {formatDate(author.createdAt)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hide-m max-w-[160px] truncate text-[12.5px] text-t3">
                      {author.alias ?? '—'}
                    </td>
                    <td className="text-[12.5px] tabular-nums text-t2">{author.albumCount} 套</td>
                    <td className="hide-m max-w-[180px] truncate text-[12px] text-t3">
                      {author.styleTags.length > 0 ? author.styleTags.join(' / ') : '—'}
                    </td>
                    <td className="hide-m text-[12px] tabular-nums text-t3">{author.sortWeight}</td>
                    <td>
                      {author.status === 1 ? (
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
                          onClick={() => openEdit(author)}
                        >
                          <Pencil size={11} />
                          编辑
                        </button>
                        <button
                          type="button"
                          className="rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-brand2"
                          onClick={() => toggle(author)}
                        >
                          {author.status === 1 ? '隐藏' : '展示'}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-[#ff8194]"
                          onClick={() => remove(author)}
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
          <Empty title="暂无作者" text="点击右上角「新建作者」创建第一位作者。" />
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editing ? `编辑作者 #${editing.id}` : '新建作者'}
        onClose={() => setModalOpen(false)}
        width={600}
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
        <div className="mb-4 flex items-center gap-4">
          <AvatarBox
            name={form.name || '希'}
            initial={form.initial || form.name.slice(0, 1) || '希'}
            color={form.color}
            avatarUrl={form.avatarUrl}
            size={56}
            rounded={12}
          />
          <div>
            <button
              type="button"
              className="btn btn-line btn-sm"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
            >
              <Upload size={13} />
              {uploadingAvatar ? '上传中…' : '上传头像'}
            </button>
            {form.avatarUrl ? (
              <button
                type="button"
                className="ml-2 inline-flex items-center gap-1 text-[11.5px] text-t3 transition hover:text-brand2"
                onClick={() => setForm((value) => ({ ...value, avatarUrl: null }))}
              >
                <X size={11} />
                移除图片
              </button>
            ) : null}
            <p className="mt-1.5 text-[11px] text-t3">jpg / png / webp，≤ 5MB，按 1:1 方形展示</p>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              void uploadAvatar(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>

        <div className="frow">
          <div className="field">
            <label>
              作者名 <i>*</i>
            </label>
            <input
              value={form.name}
              maxLength={32}
              onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
              placeholder="如：铃木美咲"
            />
          </div>
          <div className="field">
            <label>别名</label>
            <input
              value={form.alias}
              maxLength={64}
              onChange={(event) => setForm((value) => ({ ...value, alias: event.target.value }))}
              placeholder="多个别名用逗号分隔"
            />
          </div>
        </div>

        <div className="frow">
          <div className="field">
            <label>头像首字</label>
            <input
              value={form.initial}
              maxLength={2}
              onChange={(event) => setForm((value) => ({ ...value, initial: event.target.value }))}
              placeholder="留空自动取作者名首字"
            />
          </div>
          <div className="field">
            <label>排序权重（越大越靠前）</label>
            <input
              type="number"
              value={form.sortWeight}
              onChange={(event) =>
                setForm((value) => ({ ...value, sortWeight: Number(event.target.value) }))
              }
            />
          </div>
        </div>

        <div className="field">
          <label>色卡颜色</label>
          <div className="flex flex-wrap items-center gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`h-7 w-7 rounded-full border-2 transition ${
                  form.color === color ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
                style={{ background: color }}
                onClick={() => setForm((value) => ({ ...value, color }))}
                aria-label={`使用颜色 ${color}`}
              />
            ))}
            <input
              type="color"
              value={form.color}
              onChange={(event) => setForm((value) => ({ ...value, color: event.target.value }))}
              className="h-8 w-10 cursor-pointer p-0.5"
            />
          </div>
        </div>

        <div className="field">
          <label>风格标签</label>
          <input
            value={form.styleTags}
            onChange={(event) => setForm((value) => ({ ...value, styleTags: event.target.value }))}
            placeholder="日系, 胶片, 人像"
          />
        </div>

        <div className="field">
          <label>简介</label>
          <textarea
            value={form.bio}
            maxLength={500}
            onChange={(event) => setForm((value) => ({ ...value, bio: event.target.value }))}
            placeholder="作者主页介绍卡内容"
          />
        </div>
      </Modal>
    </div>
  );
}
