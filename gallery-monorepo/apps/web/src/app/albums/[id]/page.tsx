'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import {
  Bell,
  ChevronRight,
  Coins,
  Download,
  Eye,
  Film,
  Flag,
  Heart,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  Reply,
  Share2,
  Tag,
  Trash2,
} from 'lucide-react';

import { ROLE_LABELS, type AlbumDetailDto, type CommentDto } from '@sylvie/types';
import { cn, formatCount, formatDateTime, formatPrice } from '@sylvie/utils';
import { Avatar, AuthorAvatar, CoverImage, EmptyState, DetailSkeleton } from '@sylvie/ui/web';

import { Lightbox } from '@/components/lightbox';
import { apiFetch, downloadFile } from '@/lib/api';
import { revalidateAll as refreshAll, useAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { useBootstrap } from '@/lib/hooks';
import { useToast } from '@/lib/toast';

interface ReplyTarget {
  rootId: number;
  parentId: number;
  replyToUserId: number;
  replyToName: string;
}

function roleBadge(role: string): string {
  if (role === 'vip') {
    return 'bg-[linear-gradient(90deg,#ffd777,#e0a53a)] text-[#3a2600]';
  }
  if (role === 'admin') {
    return 'bg-[rgba(122,150,255,.16)] text-[#8fa6ff]';
  }
  return 'bg-[linear-gradient(90deg,#a3142f,#6d0d20)] text-[#ffd3da]';
}

function statusBadge(status: CommentDto['status']) {
  if (status === 'pending') {
    return (
      <span className="rounded border border-brand/50 px-1.5 py-0.5 text-[10.5px] text-brand2">
        审核中
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="rounded border border-white/15 px-1.5 py-0.5 text-[10.5px] text-t3">
        未通过
      </span>
    );
  }
  return null;
}

function CommentBlock({
  comment,
  rootId,
  isReply = false,
  replyTarget,
  replyText,
  replyPending,
  onReplyText,
  onReply,
  onSubmitReply,
  onCancelReply,
  onDelete,
}: {
  comment: CommentDto;
  rootId: number;
  isReply?: boolean;
  replyTarget: ReplyTarget | null;
  replyText: string;
  replyPending: boolean;
  onReplyText: (value: string) => void;
  onReply: (target: ReplyTarget) => void;
  onSubmitReply: () => void;
  onCancelReply: () => void;
  onDelete: (comment: CommentDto) => void;
}) {
  const showEditor = replyTarget?.rootId === rootId;

  return (
    <div className={isReply ? 'flex gap-2.5' : 'flex gap-3'}>
      <Avatar
        nickname={comment.user.nickname}
        avatarType={comment.user.avatarType}
        avatarIndex={comment.user.avatarIndex}
        avatarUrl={comment.user.avatarUrl}
        size={isReply ? 26 : 32}
        className={isReply ? 'mt-0.5' : ''}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <b className={isReply ? 'text-[12.5px] font-semibold' : 'text-[13px] font-semibold'}>
            {comment.user.nickname}
          </b>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              roleBadge(comment.user.role),
            )}
          >
            {ROLE_LABELS[comment.user.role]}
          </span>
          {isReply && comment.replyToName ? (
            <span className="text-[12px] text-t3">
              回复 <b className="font-semibold text-[#8fb6ff]">@{comment.replyToName}</b>
            </span>
          ) : null}
          <span className="text-[11.5px] text-t3">{formatDateTime(comment.createdAt)}</span>
          {statusBadge(comment.status)}
          {comment.isMine ? (
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-t3 transition hover:text-[#ff6b81]"
              onClick={() => onDelete(comment)}
            >
              <Trash2 size={12} />
              删除
            </button>
          ) : null}
        </div>
        <p
          className={cn(
            'mt-1.5 whitespace-pre-line break-words leading-relaxed text-[#dcdce1]',
            isReply ? 'text-[13px]' : 'text-[13.5px]',
          )}
        >
          {comment.content}
        </p>
        {!isReply ? (
          <div className="mt-2 flex items-center gap-4 text-[11.5px] text-t3">
            <button
              type="button"
              className="inline-flex items-center gap-1 transition hover:text-brand2"
              onClick={() =>
                onReply({
                  rootId,
                  parentId: comment.id,
                  replyToUserId: comment.user.id,
                  replyToName: comment.user.nickname,
                })
              }
            >
              <Reply size={12} />
              回复
            </button>
          </div>
        ) : (
          <div className="mt-1.5 flex items-center gap-4 text-[11.5px] text-t3">
            <button
              type="button"
              className="inline-flex items-center gap-1 transition hover:text-brand2"
              onClick={() =>
                onReply({
                  rootId,
                  parentId: rootId,
                  replyToUserId: comment.user.id,
                  replyToName: comment.user.nickname,
                })
              }
            >
              <Reply size={12} />
              回复
            </button>
          </div>
        )}

        {showEditor ? (
          <div className="mt-2.5 flex gap-2">
            <input
              className="input flex-1"
              value={replyText}
              onChange={(event) => onReplyText(event.target.value)}
              placeholder={`回复 @${replyTarget?.replyToName ?? ''}`}
              maxLength={500}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  onSubmitReply();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-brand btn-sm"
              onClick={onSubmitReply}
              disabled={replyPending}
            >
              {replyPending ? '提交中…' : '发送'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelReply}>
              取消
            </button>
          </div>
        ) : null}

        {!isReply && comment.replies.length > 0 ? (
          <div className="mt-3 space-y-3 border-l-2 border-panel3 pl-3.5">
            {comment.replies.map((reply) => (
              <CommentBlock
                key={reply.id}
                comment={reply}
                rootId={rootId}
                isReply
                replyTarget={replyTarget}
                replyText={replyText}
                replyPending={replyPending}
                onReplyText={onReplyText}
                onReply={onReply}
                onSubmitReply={onSubmitReply}
                onCancelReply={onCancelReply}
                onDelete={onDelete}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AlbumDetailPage() {
  const params = useParams<{ id: string }>();
  const albumId = Number(params.id);
  const router = useRouter();
  const { user, token, openAuth, refreshUser } = useAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const { data: bootstrap } = useBootstrap();

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [replyText, setReplyText] = useState('');
  const [commentPending, setCommentPending] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [subscribePending, setSubscribePending] = useState(false);
  const [unlockPending, setUnlockPending] = useState(false);
  const [downloadPending, setDownloadPending] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<AlbumDetailDto>(
    Number.isFinite(albumId) ? [`/albums/${albumId}`, token ?? 'guest'] : null,
    () => apiFetch<AlbumDetailDto>(`/api/albums/${albumId}`),
  );

  if (isLoading && !data) {
    return <DetailSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="wrap">
        <div className="panel">
          <EmptyState
            icon={<Lock size={22} />}
            title="图集不存在或已下架"
            text="可能已被管理员下架，去看看其他作品吧。"
            action={
              <Link href="/albums" className="btn btn-outline">
                返回图集列表
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const detail = data;
  const plan = bootstrap?.plans[0];
  const planPrice = plan ? plan.priceCents : 1900;
  const images = detail.images.filter((image) => image.mediaType === 'image');
  const videos = detail.images.filter((image) => image.mediaType === 'video');
  const canViewAll = detail.canDownload;
  const memberCardTitle = user ? `${detail.points} 积分看这一套` : '免费注册';

  const share = async () => {
    const url = window.location.href;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: detail.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast('链接已复制到剪贴板', 'success');
      }
    } catch {
      // 用户取消分享不提示
    }
  };

  const toggleFavorite = async () => {
    if (!user) {
      openAuth('login');
      return;
    }
    if (favoritePending) {
      return;
    }
    setFavoritePending(true);
    try {
      const result = await apiFetch<{ favorited: boolean; favCount: number }>(
        `/api/albums/${detail.id}/favorite`,
        { method: 'POST' },
      );
      toast(result.favorited ? '已收藏' : '已取消收藏', 'success');
      await mutate(
        {
          ...detail,
          favorited: result.favorited,
          favCount: result.favCount,
        },
        { revalidate: true },
      );
      void refreshAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '操作失败', 'error');
    } finally {
      setFavoritePending(false);
    }
  };

  const toggleSubscribe = async () => {
    if (!user) {
      openAuth('login');
      return;
    }
    if (subscribePending) {
      return;
    }
    setSubscribePending(true);
    try {
      const result = await apiFetch<{ subscribed: boolean }>(
        `/api/authors/${detail.author.id}/subscribe`,
        { method: 'POST' },
      );
      toast(result.subscribed ? '已订阅该作者' : '已取消订阅', 'success');
      await mutate(
        {
          ...detail,
          author: { ...detail.author, subscribed: result.subscribed },
        },
        { revalidate: true },
      );
      void refreshAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '操作失败', 'error');
    } finally {
      setSubscribePending(false);
    }
  };

  const unlock = async () => {
    if (!user) {
      openAuth('login');
      return;
    }
    if (detail.points > user.points) {
      toast(
        `解锁积分不足，还需 ${detail.points - user.points} 积分，可每日签到或开通会员`,
        'error',
      );
      return;
    }
    const ok = await confirm({
      title: '使用积分解锁图集？',
      text: `将消耗 ${detail.points} 解锁积分（当前 ${user.points}，解锁后剩余 ${
        user.points - detail.points
      }）。\n解锁后可查看完整 ${detail.totalImages} 张图片并支持下载。`,
      okText: `${detail.points} 积分解锁`,
    });
    if (!ok) {
      return;
    }
    setUnlockPending(true);
    try {
      const result = await apiFetch<{ points: number }>(`/api/albums/${detail.id}/unlock`, {
        method: 'POST',
      });
      toast(`解锁成功，当前剩余 ${result.points} 积分`, 'success');
      await refreshUser();
      await mutate();
      void refreshAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '解锁失败', 'error');
    } finally {
      setUnlockPending(false);
    }
  };

  const download = async () => {
    if (!user) {
      openAuth('login');
      return;
    }
    if (!detail.canDownload) {
      await unlock();
      return;
    }
    if (downloadPending) {
      return;
    }
    setDownloadPending(true);
    try {
      await downloadFile(`/api/albums/${detail.id}/download`, `${detail.title}.zip`);
      toast('打包下载已开始', 'success');
      await refreshUser();
      void mutate();
      void refreshAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '下载失败', 'error');
    } finally {
      setDownloadPending(false);
    }
  };

  const handlePrimary = async () => {
    if (!user) {
      openAuth('login');
      return;
    }
    if (!detail.canDownload) {
      await unlock();
      return;
    }
    await download();
  };

  const submitComment = async () => {
    if (!user) {
      openAuth('login');
      return;
    }
    const content = commentText.trim();
    if (!content) {
      toast('请输入评论内容', 'error');
      return;
    }
    if (commentPending) {
      return;
    }
    setCommentPending(true);
    try {
      await apiFetch<CommentDto>(`/api/albums/${detail.id}/comments`, {
        method: 'POST',
        body: { content },
      });
      setCommentText('');
      toast('评论已提交，审核通过后展示', 'success');
      await mutate();
      await refreshUser();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '评论失败', 'error');
    } finally {
      setCommentPending(false);
    }
  };

  const submitReply = async () => {
    if (!user) {
      openAuth('login');
      return;
    }
    if (!replyTarget) {
      return;
    }
    const content = replyText.trim();
    if (!content) {
      toast('请输入回复内容', 'error');
      return;
    }
    if (replyPending) {
      return;
    }
    setReplyPending(true);
    try {
      await apiFetch<CommentDto>(`/api/albums/${detail.id}/comments`, {
        method: 'POST',
        body: {
          content,
          parentId: replyTarget.parentId,
          replyToUserId: replyTarget.replyToUserId,
        },
      });
      setReplyText('');
      setReplyTarget(null);
      toast('回复已提交，审核通过后展示', 'success');
      await mutate();
      await refreshUser();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '回复失败', 'error');
    } finally {
      setReplyPending(false);
    }
  };

  const deleteComment = async (comment: CommentDto) => {
    const ok = await confirm({
      title: '删除这条评论？',
      text: '删除后不可恢复，其下的回复也会一并删除。',
      okText: '删除',
    });
    if (!ok) {
      return;
    }
    try {
      await apiFetch<null>(`/api/comments/${comment.id}`, { method: 'DELETE' });
      toast('评论已删除', 'success');
      await mutate();
      await refreshUser();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '删除失败', 'error');
    }
  };

  const openReply = (target: ReplyTarget) => {
    if (!user) {
      openAuth('login');
      return;
    }
    setReplyTarget(target);
    setReplyText('');
  };

  const descriptionLine = canViewAll
    ? `已解锁，可在线查看全部；原图压缩包 ${detail.packageSize} MB，可打包下载`
    : user
      ? `可预览 3 张，解锁后在线看全部；原图压缩包 ${detail.packageSize} MB，解锁后下载`
      : `登录可预览 3 张，解锁后在线看全部；原图压缩包 ${detail.packageSize} MB，解锁后下载`;

  const primaryLabel = !user
    ? '登录解锁'
    : !detail.canDownload
      ? `${detail.points} 积分解锁`
      : '下载全部';

  return (
    <div className="wrap pb-24 lg:pb-14">
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-t3">
        <Link href="/" className="transition hover:text-brand2">
          首页
        </Link>
        <ChevronRight size={12} className="opacity-50" />
        <Link href="/albums" className="transition hover:text-brand2">
          图集
        </Link>
        <ChevronRight size={12} className="opacity-50" />
        <Link href={`/authors/${detail.author.id}`} className="transition hover:text-brand2">
          {detail.author.name}
        </Link>
        <ChevronRight size={12} className="opacity-50" />
        <span className="max-w-[52%] truncate">{detail.title}</span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_346px]">
        <div className="min-w-0">
          <section className="rounded-2xl border border-line bg-[#121215] p-5 sm:p-6">
            <div className="flex flex-wrap items-start gap-3">
              <h1 className="min-w-0 flex-1 text-[23px] font-extrabold leading-snug tracking-tight text-brand sm:text-[26px]">
                {detail.title}
              </h1>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className={cn(
                    'btn btn-outline btn-sm',
                    detail.favorited && 'chip-brand text-brand2',
                  )}
                  onClick={toggleFavorite}
                  disabled={favoritePending}
                >
                  <Heart size={13} fill={detail.favorited ? 'currentColor' : 'none'} />
                  {detail.favorited ? '已收藏' : '收藏'}
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={share}>
                  <Share2 size={13} />
                  分享
                </button>
              </div>
            </div>

            <p className="mt-3 text-[12.5px] tabular-nums text-t3">
              {formatDateTime(detail.publishedAt)} · {formatCount(detail.viewCount)} 次浏览
            </p>
            <p className="mt-2.5 text-[13.5px] leading-[1.85] text-[#b9b9c2]">{descriptionLine}</p>
            {detail.description ? (
              <p className="mt-2 text-[12.5px] leading-[1.9] text-t3">{detail.description}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/authors/${detail.author.id}`} className="chip hover:text-t1">
                <Flag size={12} className="text-brand2" />
                {detail.author.name}
              </Link>
              <button
                type="button"
                className={cn('chip', detail.author.subscribed ? 'chip-gray' : 'chip-amber')}
                onClick={toggleSubscribe}
                disabled={subscribePending}
              >
                <Bell size={12} />
                {detail.author.subscribed ? '已订阅' : '订阅'}
              </button>
              <span className="chip">
                <ImageIcon size={12} />
                {detail.imageCount}P
              </span>
              {detail.videoCount > 0 ? (
                <span className="chip">
                  <Film size={12} />
                  {detail.videoCount}V
                </span>
              ) : null}
              {detail.tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/albums?tag=${encodeURIComponent(tag.name)}`}
                  className="chip"
                >
                  <Tag size={12} />#{tag.name}
                </Link>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-xl border border-line bg-panel text-center lg:hidden">
              {[
                { label: '图片', value: `${detail.imageCount}P` },
                { label: '视频', value: detail.videoCount > 0 ? `${detail.videoCount}V` : '—' },
                { label: '解锁积分', value: detail.points > 0 ? String(detail.points) : '会员' },
                { label: '压缩包', value: `${detail.packageSize}MB` },
              ].map((item, index) => (
                <div
                  key={item.label}
                  className={cn('min-w-0 px-1 py-2.5', index < 3 && 'border-r border-line')}
                >
                  <b className="block break-all text-[11.5px] leading-tight tabular-nums">
                    {item.value}
                  </b>
                  <span className="mt-1 block text-[10px] text-t3">{item.label}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-4 flex flex-col gap-3">
            {videos.map((video) => (
              <div
                key={video.id}
                className="relative overflow-hidden rounded-xl border border-line bg-black"
              >
                <video
                  controls
                  preload="metadata"
                  poster={video.thumbUrl ?? undefined}
                  src={video.url}
                  className="aspect-video w-full"
                />
                <span className="absolute left-3 top-3 rounded bg-brand/85 px-2 py-1 text-[11px] text-white">
                  视频
                </span>
                {video.duration ? (
                  <span className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-[11px] tabular-nums text-white">
                    {video.duration}s
                  </span>
                ) : null}
              </div>
            ))}

            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                className="group relative overflow-hidden rounded-xl border border-line bg-[#101014]"
                onClick={() => setLightboxIndex(index)}
              >
                <div
                  className="w-full"
                  style={{
                    aspectRatio:
                      image.width && image.height
                        ? `${image.width} / ${image.height}`
                        : '3 / 4',
                  }}
                >
                  <CoverImage
                    src={image.url}
                    alt={`${detail.title} 第 ${index + 1} 张`}
                    eager={index < 2}
                    fallback="希"
                    className="transition duration-300 group-hover:scale-[1.01]"
                  />
                </div>
                <span className="absolute bottom-2.5 left-3 rounded bg-black/60 px-2 py-1 text-[11px] tabular-nums text-white/90 backdrop-blur">
                  {index + 1} / {detail.totalImages}
                </span>
                {detail.watermark ? (
                  <span className="absolute right-3 top-3 rounded bg-brand/80 px-2 py-1 text-[10.5px] text-white">
                    预览 · 水印
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {detail.locked ? (
            <section className="pt-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-brand/20 bg-brand-dim">
                <Lock size={26} className="text-brand" />
              </div>
              <h2 className="text-[21px] font-extrabold text-brand">
                还有 <b className="mx-1 text-[23px]">{detail.lockedCount}</b> 张图片未解锁
              </h2>

              <div className="mt-6 flex flex-col gap-3.5 text-left sm:flex-row">
                <div className="flex flex-1 flex-col rounded-2xl border border-line bg-[#0c0c0f] p-[18px]">
                  <h4 className="text-[15px] font-bold">{memberCardTitle}</h4>
                  <p className="mb-5 mt-2 text-[12.5px] leading-relaxed text-t3">
                    {user
                      ? `解锁后可查看完整 ${detail.totalImages} 张图片并支持下载`
                      : `登录后用 ${detail.points} 积分解锁完整 ${detail.totalImages} 张图集`}
                  </p>
                  <button
                    type="button"
                    className="mt-auto w-full rounded-[9px] border border-brand/70 py-3 text-[14px] font-bold text-brand transition hover:bg-brand-dim disabled:opacity-50"
                    onClick={() => (user ? unlock() : openAuth('register'))}
                    disabled={unlockPending}
                  >
                    {user ? `${detail.points} 积分解锁` : '登录 / 注册'}
                  </button>
                </div>

                <div className="flex flex-1 flex-col rounded-2xl border border-brand/60 bg-[radial-gradient(320px_150px_at_50%_-30%,rgba(255,45,85,.14),transparent_72%),#0c0c0f] p-[18px]">
                  <h4 className="text-[15px] font-bold">付费会员</h4>
                  <div className="mt-2 flex items-baseline gap-1">
                    <b className="text-[21px] font-extrabold text-brand">
                      {formatPrice(planPrice)}
                    </b>
                    <small className="text-[11.5px] text-t3">/ {plan?.durationDays ?? 30} 天</small>
                  </div>
                  <p className="mb-5 mt-2 text-[12.5px] leading-relaxed text-t3">
                    全站图集无限畅看，整包下载原图
                  </p>
                  <button
                    type="button"
                    className="btn btn-brand mt-auto w-full py-3"
                    onClick={() => router.push('/membership')}
                  >
                    立即开通
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed border-line2 px-4 py-3.5 text-center text-[12.5px] text-t3">
              已解锁全部 {detail.totalImages} 张内容 · 打包下载（{detail.packageSize} MB）
              <button
                type="button"
                className="font-semibold text-brand2 transition hover:text-brand"
                onClick={download}
                disabled={downloadPending}
              >
                {downloadPending ? '正在打包…' : '下载'}
              </button>
            </div>
          )}

          <section className="mt-8 border-t border-line pt-5">
            <div className="mb-4 flex items-center gap-2.5">
              <h2 className="text-[16px] font-extrabold">评论</h2>
              <span className="text-xs text-t3">{detail.commentTotal} 条</span>
              <span className="ml-auto text-[11px] text-t3">先审后发 · 通过后展示</span>
            </div>

            <div className="mb-5 flex gap-2.5">
              {user ? (
                <Avatar
                  nickname={user.nickname}
                  avatarType={user.avatarType}
                  avatarIndex={user.avatarIndex}
                  avatarUrl={user.avatarUrl}
                  size={34}
                />
              ) : (
                <button
                  type="button"
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-panel3 text-[11px] text-t3"
                  onClick={() => openAuth('login')}
                  aria-label="登录"
                >
                  希
                </button>
              )}
              <div className="flex-1 overflow-hidden rounded-xl border border-line bg-panel transition focus-within:border-brand/45">
                <textarea
                  className="textarea min-h-[74px]"
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  onFocus={() => {
                    if (!user) {
                      openAuth('login');
                    }
                  }}
                  placeholder={user ? '友善发言，评论与回复经管理员审核后展示' : '登录后发表评论'}
                  maxLength={500}
                  readOnly={!user}
                />
                <div className="flex items-center gap-2 border-t border-line px-3 py-2">
                  <span className="text-[11px] text-t3">{commentText.length}/500</span>
                  <button
                    type="button"
                    className="btn btn-brand btn-sm ml-auto"
                    onClick={submitComment}
                    disabled={commentPending || !user}
                  >
                    {commentPending ? '提交中…' : '发表评论'}
                  </button>
                </div>
              </div>
            </div>

            {detail.comments.length > 0 ? (
              <div className="space-y-0">
                {detail.comments.map((comment) => (
                  <div key={comment.id} className="border-b border-line py-4 last:border-b-0">
                    <CommentBlock
                      comment={comment}
                      rootId={comment.id}
                      replyTarget={replyTarget}
                      replyText={replyText}
                      replyPending={replyPending}
                      onReplyText={setReplyText}
                      onReply={openReply}
                      onSubmitReply={submitReply}
                      onCancelReply={() => setReplyTarget(null)}
                      onDelete={deleteComment}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-t3">
                <MessageCircle size={18} className="mx-auto mb-2" />
                还没有评论，来抢沙发吧
              </div>
            )}
          </section>
        </div>

        <aside className="hidden flex-col gap-4 lg:sticky lg:top-[84px] lg:flex">
          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-[14px] font-bold">当前图集</h3>
              <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-t3">
                <Eye size={12} />
                {formatCount(detail.viewCount)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: <ImageIcon size={12} />, label: '图片数', value: `${detail.imageCount}P` },
                {
                  icon: <Film size={12} />,
                  label: '视频数',
                  value: detail.videoCount > 0 ? `${detail.videoCount}V` : '暂无',
                },
                {
                  icon: <Coins size={12} />,
                  label: '解锁积分',
                  value: detail.points > 0 ? `${detail.points} 分` : '会员',
                  red: true,
                },
                {
                  icon: <Download size={12} />,
                  label: '压缩包',
                  value: `${detail.packageSize} MB`,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[10px] border border-line bg-panel2 px-3 py-2.5"
                >
                  <div className="flex items-center gap-1.5 text-[11.5px] text-t3">
                    {stat.icon}
                    {stat.label}
                  </div>
                  <div
                    className={cn(
                      'mt-1 text-[16px] font-bold tabular-nums',
                      stat.red && 'text-brand2',
                    )}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn btn-brand flex-1 py-2.5 text-[13.5px]"
                onClick={handlePrimary}
                disabled={unlockPending || downloadPending}
              >
                {downloadPending ? '正在打包…' : primaryLabel}
              </button>
              <button
                type="button"
                className={cn('icon-btn h-[42px] w-[42px]', detail.favorited && 'on')}
                onClick={toggleFavorite}
                aria-label="收藏"
              >
                <Heart size={16} fill={detail.favorited ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                className="icon-btn h-[42px] w-[42px]"
                onClick={share}
                aria-label="分享"
              >
                <Share2 size={16} />
              </button>
            </div>
            {detail.locked ? (
              <p className="mt-2.5 text-center text-[11px] text-t3">
                未解锁仅展示前 3 张 · 解锁后可下载原图
              </p>
            ) : null}
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-[14px] font-bold">作者 / 合集</h3>
              <Link
                href={`/authors/${detail.author.id}`}
                className="ml-auto text-[11.5px] text-t3 transition hover:text-brand2"
              >
                查看全部 ›
              </Link>
            </div>
            <Link href={`/authors/${detail.author.id}`} className="flex items-center gap-2.5">
              <AuthorAvatar
                name={detail.author.name}
                initial={detail.author.initial}
                color={detail.author.color}
                avatarUrl={detail.author.avatarUrl}
                size={42}
                className="rounded-xl"
              />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-brand2">
                  {detail.author.name}
                </p>
                <p className="mt-0.5 text-[11.5px] text-t3">共收录 {detail.author.albumCount} 套</p>
              </div>
            </Link>
            <p className="mt-3 text-[11px] leading-relaxed text-t3">
              优先浏览同合集内容，点击进入作者主页。
            </p>
          </div>

          {detail.otherWorks.length > 0 ? (
            <div className="panel p-4">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-[14px] font-bold">TA 的其他作品</h3>
                <Link
                  href={`/authors/${detail.author.id}`}
                  className="ml-auto text-[11.5px] text-t3 transition hover:text-brand2"
                >
                  查看更多 ›
                </Link>
              </div>
              <div className="space-y-1">
                {detail.otherWorks.map((work) => (
                  <Link
                    key={work.id}
                    href={`/albums/${work.id}`}
                    className="-ml-1.5 flex gap-2.5 rounded-lg py-2 pl-1.5 pr-1 transition hover:bg-panel2"
                  >
                    <div className="h-[58px] w-[58px] shrink-0 overflow-hidden rounded-lg border border-line">
                      <CoverImage src={work.coverUrl} alt={work.title} fallback="希" />
                    </div>
                    <div className="min-w-0">
                      <p className="clamp-2 text-[12.5px] leading-snug text-[#ff7d90]">
                        {work.title}
                      </p>
                      <p className="mt-1 text-[11px] text-t3">
                        {work.imageCount}P{work.videoCount > 0 ? ` · ${work.videoCount}V` : ''}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="panel p-4">
            <h3 className="mb-3 text-[14px] font-bold">继续浏览</h3>
            <div className="flex flex-wrap gap-2">
              <Link href={`/authors/${detail.author.id}`} className="chip">
                <Flag size={12} className="text-brand2" />
                {detail.author.name}
              </Link>
              {detail.tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/albums?tag=${encodeURIComponent(tag.name)}`}
                  className="chip"
                >
                  #{tag.name}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-[70] flex items-center gap-2 border-t border-line bg-[rgba(13,13,16,.97)] px-3.5 py-2.5 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          className="btn btn-brand flex-1 py-3"
          onClick={handlePrimary}
          disabled={unlockPending || downloadPending}
        >
          {downloadPending ? '正在打包…' : primaryLabel}
        </button>
        <button
          type="button"
          className={cn('icon-btn h-11 w-11', detail.favorited && 'on')}
          onClick={toggleFavorite}
          aria-label="收藏"
        >
          <Heart size={17} fill={detail.favorited ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className="icon-btn h-11 w-11" onClick={share} aria-label="分享">
          <Share2 size={17} />
        </button>
      </div>

      {lightboxIndex !== null ? (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
