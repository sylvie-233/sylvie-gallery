import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import { Eye, RotateCcw, Save, Send } from 'lucide-react';

import type {
  AdminAlbumDetail,
  AdminAuthorRow,
  AdminMediaInput,
  AdminTagRow,
  PageResult,
} from '@sylvie/types';

import { AdminLightbox } from '@/components/lightbox';
import { MediaWorkbench } from '@/components/media-workbench';
import {
  AlbumStatusBadge,
  PageError,
  PageHead,
} from '@/components/ui';
import { adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';

interface EditorForm {
  title: string;
  authorId: number;
  points: number;
  description: string;
  tagIds: number[];
  coverUrl: string;
  images: AdminMediaInput[];
  videos: AdminMediaInput[];
}

const EMPTY_FORM: EditorForm = {
  title: '',
  authorId: 0,
  points: 1,
  description: '',
  tagIds: [],
  coverUrl: '',
  images: [],
  videos: [],
};

export function AlbumEditorPage() {
  const params = useParams<{ id?: string }>();
  const albumId = params.id ? Number(params.id) : null;
  const isEdit = albumId !== null && Number.isFinite(albumId);
  const navigate = useNavigate();
  const { token, revalidateAll } = useAdminAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [form, setForm] = useState<EditorForm>(EMPTY_FORM);
  const [hydrated, setHydrated] = useState(!isEdit);
  const [tagKeyword, setTagKeyword] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const formKeyRef = useRef<string>('');

  const { data: detail, error: detailError, mutate: mutateDetail } = useSWR<AdminAlbumDetail>(
    isEdit && token ? [`/albums/${albumId}`, token] : null,
    () => adminFetch<AdminAlbumDetail>(`/albums/${albumId}`),
  );
  const { data: authorPage } = useSWR<PageResult<AdminAuthorRow>>(
    token ? ['/authors?status=on&pageSize=100', token] : null,
    () => adminFetch<PageResult<AdminAuthorRow>>('/authors?status=on&pageSize=100'),
  );
  const { data: tagPage } = useSWR<PageResult<AdminTagRow>>(
    token ? ['/tags?status=on&pageSize=100', token] : null,
    () => adminFetch<PageResult<AdminTagRow>>('/tags?status=on&pageSize=100'),
  );

  const authors = useMemo(() => {
    const list = authorPage?.list ?? [];
    if (detail && !list.some((author) => author.id === detail.authorId)) {
      return [
        ...list,
        {
          id: detail.authorId,
          name: `${detail.authorName}（已隐藏）`,
          alias: null,
          initial: detail.authorInitial,
          color: detail.authorColor,
          avatarUrl: detail.authorAvatarUrl,
          coverUrl: null,
          bio: null,
          styleTags: [],
          sortWeight: 0,
          status: 0,
          albumCount: 0,
          lastUpdateAt: null,
          createdAt: '',
        },
      ];
    }
    return list;
  }, [authorPage, detail]);

  const tags = useMemo(() => {
    const list = [...(tagPage?.list ?? [])];
    if (detail) {
      for (const tag of detail.tags) {
        if (!list.some((item) => item.id === tag.id)) {
          list.push({
            id: tag.id,
            name: tag.name,
            useCount: tag.useCount,
            status: 0,
            createdAt: '',
          });
        }
      }
    }
    return list;
  }, [tagPage, detail]);

  const formKey = isEdit ? `edit-${albumId}` : 'new';
  useEffect(() => {
    if (formKeyRef.current === formKey) return;
    formKeyRef.current = formKey;
    if (!isEdit) {
      setForm(EMPTY_FORM);
      setHydrated(true);
      setTagKeyword('');
      return;
    }
    setHydrated(false);
  }, [formKey, isEdit]);

  useEffect(() => {
    if (isEdit && detail && !hydrated) {
      setForm({
        title: detail.title,
        authorId: detail.authorId,
        points: detail.points,
        description: detail.description ?? '',
        tagIds: detail.tags.map((tag) => tag.id),
        coverUrl: detail.coverUrl,
        images: detail.images,
        videos: detail.videos,
      });
      setHydrated(true);
    }
  }, [detail, hydrated, isEdit]);

  useEffect(() => {
    if (!isEdit && form.authorId === 0 && authors.length > 0) {
      setForm((value) => ({ ...value, authorId: authors[0]?.id ?? 0 }));
    }
  }, [authors, form.authorId, isEdit]);

  const selectedTags = tags.filter((tag) => form.tagIds.includes(tag.id));
  const availableTags = tags.filter(
    (tag) =>
      !form.tagIds.includes(tag.id) &&
      (!tagKeyword.trim() || tag.name.toLowerCase().includes(tagKeyword.trim().toLowerCase())),
  );

  const toggleTag = (tagId: number) => {
    if (form.tagIds.includes(tagId)) {
      setForm((value) => ({ ...value, tagIds: value.tagIds.filter((id) => id !== tagId) }));
      return;
    }
    if (form.tagIds.length >= 8) {
      toast('最多选择 8 个标签', 'error');
      return;
    }
    setForm((value) => ({ ...value, tagIds: [...value.tagIds, tagId] }));
  };

  const save = async (mode: 'draft' | 'publish' | 'keep') => {
    if (!form.title.trim() || Array.from(form.title.trim()).length > 60) {
      toast('标题需为 1-60 个字符', 'error');
      return;
    }
    if (!form.authorId) {
      toast('请选择归属作者', 'error');
      return;
    }
    if (mode === 'publish' && form.images.length === 0) {
      toast('发布图集至少需要 1 张图片', 'error');
      return;
    }
    if (mode === 'publish') {
      const authorName = authors.find((author) => author.id === form.authorId)?.name ?? '—';
      const ok = await confirm({
        title: isEdit && detail?.status === 'published' ? '保存并发布修改？' : '发布该图集？',
        text: `标题：${form.title.trim()}\n作者：${authorName}\n图片 ${form.images.length} 张 · 视频 ${form.videos.length} 个\n发布后将立即在前台展示。`,
        okText: '发布图集',
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        authorId: form.authorId,
        points: Math.min(99, Math.max(0, Math.floor(form.points))),
        description: form.description.trim(),
        tagIds: form.tagIds,
        coverUrl: form.coverUrl || form.images[0]?.url || '',
        ...(mode === 'keep' ? {} : { status: mode === 'draft' ? 'draft' : 'published' }),
        images: form.images,
        videos: form.videos,
      };
      if (isEdit) {
        await adminFetch<AdminAlbumDetail>(`/albums/${albumId}`, {
          method: 'PUT',
          body: payload,
        });
      } else {
        await adminFetch<AdminAlbumDetail>('/albums', { method: 'POST', body: payload });
      }
      toast(mode === 'draft' ? '草稿已保存' : '图集已保存', 'success');
      void revalidateAll();
      navigate('/albums');
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && detailError) {
    return (
      <div className="panel">
        <PageError message="图集详情加载失败" onRetry={() => mutateDetail()} />
      </div>
    );
  }

  if (isEdit && (!detail || !hydrated)) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-52" />
        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4">
          <div className="skeleton h-[520px]" />
          <div className="skeleton h-[420px]" />
        </div>
      </div>
    );
  }

  const status = detail?.status ?? 'draft';
  const mediaCount = form.images.length + form.videos.length;

  return (
    <div>
      <PageHead
        title={isEdit ? '编辑图集' : '发布图集'}
        sub={
          isEdit ? (
            <span className="inline-flex items-center gap-2">
              <span>#{albumId}</span>
              <AlbumStatusBadge status={status} />
            </span>
          ) : (
            '所有图集仅管理员可发布 · 拖拽调整媒体顺序，编号即前台展示顺序'
          )
        }
      >
        <button
          type="button"
          className="btn btn-line"
          onClick={() => setLightboxIndex(0)}
          disabled={form.images.length === 0}
        >
          <Eye size={14} />
          预览
        </button>
        <Link to="/albums" className="btn btn-ghost-red">
          返回列表
        </Link>
      </PageHead>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-4">
        <MediaWorkbench
          images={form.images}
          videos={form.videos}
          coverUrl={form.coverUrl}
          onImagesChange={(images) =>
            setForm((value) => ({
              ...value,
              images,
              coverUrl: images.some((image) => image.url === value.coverUrl)
                ? value.coverUrl
                : (images[0]?.url ?? ''),
            }))
          }
          onVideosChange={(videos) => setForm((value) => ({ ...value, videos }))}
          onCoverChange={(coverUrl) => setForm((value) => ({ ...value, coverUrl }))}
          onPreview={(index) => setLightboxIndex(index)}
        />

        <div className="sticky top-[74px] space-y-4">
          <div className="panel">
            <div className="p-title">基本信息</div>
            <div className="p-4">
              <div className="field">
                <label>
                  标题 <i>*</i>
                  <span className="ml-auto text-[11px] tabular-nums">
                    {Array.from(form.title).length}/60
                  </span>
                </label>
                <input
                  value={form.title}
                  maxLength={60}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, title: event.target.value }))
                  }
                  placeholder="如：绝对主观美少女 Vol.7"
                />
              </div>

              <div className="frow">
                <div className="field">
                  <label>
                    归属作者 <i>*</i>
                  </label>
                  <select
                    value={form.authorId}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, authorId: Number(event.target.value) }))
                    }
                  >
                    <option value={0}>请选择作者</option>
                    {authors.map((author) => (
                      <option key={author.id} value={author.id}>
                        {author.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>解锁积分</label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={form.points}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, points: Number(event.target.value) }))
                    }
                  />
                </div>
              </div>

              <div className="field">
                <label>简介</label>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, description: event.target.value }))
                  }
                  placeholder="一段展示在详情页的说明文字"
                />
              </div>

              <div className="field">
                <label>
                  标签（搜索添加，最多 8 个）
                  <span className="ml-auto tabular-nums">{form.tagIds.length}/8</span>
                </label>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {selectedTags.map((tag) => (
                    <span key={tag.id} className="badge badge-brand">
                      #{tag.name}
                      <button
                        type="button"
                        className="ml-0.5 opacity-70 hover:opacity-100"
                        onClick={() => toggleTag(tag.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {selectedTags.length === 0 ? (
                    <span className="text-[11.5px] text-t3">尚未选择标签</span>
                  ) : null}
                </div>
                <input
                  value={tagKeyword}
                  onChange={(event) => setTagKeyword(event.target.value)}
                  placeholder="搜索标签，如：日系 / 胶片"
                />
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-line bg-panel2 p-1.5">
                  {availableTags.length === 0 ? (
                    <p className="px-2 py-3 text-center text-[11.5px] text-t3">
                      没有可添加的标签
                    </p>
                  ) : (
                    availableTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[12.5px] text-t2 transition hover:bg-white/5 hover:text-t1"
                        onClick={() => toggleTag(tag.id)}
                      >
                        #{tag.name}
                        <span className="ml-auto text-[10.5px] text-t3">{tag.useCount} 套</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-1 border-t border-line pt-3 text-[11px] leading-relaxed text-t3">
                <p>· 「保存草稿」暂存不发布，稍后可在图集管理中继续</p>
                <p>· 压缩包大小由系统按原图体积自动汇总</p>
                <p>· 是否进入瀑布流推荐池，可在图集管理中按套设置</p>
              </div>
            </div>
          </div>

          <div className="panel p-4">
            {isEdit && status === 'published' ? (
              <button
                type="button"
                className="btn btn-red w-full py-2.5"
                onClick={() => save('keep')}
                disabled={saving}
              >
                <Save size={14} />
                {saving ? '保存中…' : '保存修改'}
              </button>
            ) : (
              <div className="space-y-2.5">
                {isEdit ? (
                  <button
                    type="button"
                    className="btn btn-line w-full py-2.5"
                    onClick={() => save('keep')}
                    disabled={saving}
                  >
                    <Save size={14} />
                    {saving ? '保存中…' : '保存修改'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-line w-full py-2.5"
                    onClick={() => save('draft')}
                    disabled={saving}
                  >
                    <Save size={14} />
                    保存草稿
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-red w-full py-2.5"
                  onClick={() => save('publish')}
                  disabled={saving}
                >
                  <Send size={14} />
                  {saving ? '提交中…' : '发布图集'}
                </button>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between text-[11px] text-t3">
              <span>媒体 {mediaCount} 项</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-t3 hover:text-brand2"
                onClick={() => {
                  if (isEdit) {
                    if (detail) {
                      setForm({
                        title: detail.title,
                        authorId: detail.authorId,
                        points: detail.points,
                        description: detail.description ?? '',
                        tagIds: detail.tags.map((tag) => tag.id),
                        coverUrl: detail.coverUrl,
                        images: detail.images,
                        videos: detail.videos,
                      });
                    }
                  } else {
                    setForm(EMPTY_FORM);
                  }
                  toast('已恢复为保存前的编辑内容', 'info');
                }}
              >
                <RotateCcw size={11} />
                放弃修改
              </button>
            </div>
          </div>
        </div>
      </div>

      {lightboxIndex !== null ? (
        <AdminLightbox
          images={form.images}
          index={lightboxIndex}
          coverUrl={form.coverUrl}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
