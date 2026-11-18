import { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Film,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import type { AdminMediaInput, AdminUploadResult } from '@sylvie/types';
import { formatFileSize } from '@sylvie/utils';

import { adminUpload } from '@/lib/api';
import { useToast } from '@/lib/toast';

const IMAGE_LIMIT = 99;
const VIDEO_LIMIT = 3;

function filenameFromUrl(url: string): string {
  try {
    const clean = url.split('?')[0] ?? url;
    return decodeURIComponent(clean.split('/').pop() ?? url);
  } catch {
    return url;
  }
}

export function MediaWorkbench({
  images,
  videos,
  coverUrl,
  onImagesChange,
  onVideosChange,
  onCoverChange,
  onPreview,
}: {
  images: AdminMediaInput[];
  videos: AdminMediaInput[];
  coverUrl: string;
  onImagesChange: (images: AdminMediaInput[]) => void;
  onVideosChange: (videos: AdminMediaInput[]) => void;
  onCoverChange: (url: string) => void;
  onPreview: (index: number) => void;
}) {
  const { toast } = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'img' | 'vid'>('img');
  const [uploadingImages, setUploadingImages] = useState(0);
  const [uploadingVideos, setUploadingVideos] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const coverIndex = Math.max(
    1,
    images.findIndex((image) => image.url === coverUrl) + 1,
  );

  const uploadImages = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const remain = IMAGE_LIMIT - images.length;
    if (remain <= 0) {
      toast('图片最多 99 张', 'error');
      return;
    }
    const accepted = list.slice(0, remain);
    setUploadingImages(accepted.length);
    const next = [...images];
    let success = 0;
    for (const file of accepted) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast(`${file.name} 格式不支持`, 'error');
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast(`${file.name} 超过 20MB`, 'error');
        continue;
      }
      try {
        const formData = new FormData();
        formData.append('kind', 'image');
        formData.append('file', file);
        const result = await adminUpload<AdminUploadResult>('/upload', formData);
        next.push({
          url: result.url,
          thumbUrl: result.thumbUrl,
          watermarkUrl: result.watermarkUrl,
          width: result.width,
          height: result.height,
          size: result.size,
          filename: result.filename,
        });
        success += 1;
      } catch (error) {
        toast(error instanceof Error ? error.message : `${file.name} 上传失败`, 'error');
      }
      setUploadingImages((value) => Math.max(0, value - 1));
    }
    onImagesChange(next);
    if (!coverUrl && next.length > 0) {
      onCoverChange(next[0]?.url ?? '');
    }
    if (success > 0) {
      toast(`已上传 ${success} 张图片`, 'success');
    }
  };

  const uploadVideos = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const remain = VIDEO_LIMIT - videos.length;
    if (remain <= 0) {
      toast('视频最多 3 个', 'error');
      return;
    }
    const accepted = list.slice(0, remain);
    setUploadingVideos(accepted.length);
    const next = [...videos];
    let success = 0;
    for (const file of accepted) {
      if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) {
        toast(`${file.name} 格式不支持`, 'error');
        continue;
      }
      if (file.size > 500 * 1024 * 1024) {
        toast(`${file.name} 超过 500MB`, 'error');
        continue;
      }
      try {
        const formData = new FormData();
        formData.append('kind', 'video');
        formData.append('file', file);
        const result = await adminUpload<AdminUploadResult>('/upload', formData);
        next.push({
          url: result.url,
          thumbUrl: result.thumbUrl,
          size: result.size,
          filename: result.filename,
        });
        success += 1;
      } catch (error) {
        toast(error instanceof Error ? error.message : `${file.name} 上传失败`, 'error');
      }
      setUploadingVideos((value) => Math.max(0, value - 1));
    }
    onVideosChange(next);
    if (success > 0) {
      toast(`已上传 ${success} 个视频`, 'success');
    }
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    onImagesChange(next);
  };

  const removeImage = (index: number) => {
    const removed = images[index];
    const next = images.filter((_, itemIndex) => itemIndex !== index);
    onImagesChange(next);
    if (removed && removed.url === coverUrl) {
      onCoverChange(next[0]?.url ?? '');
    }
  };

  const addSamples = () => {
    const remain = IMAGE_LIMIT - images.length;
    if (remain <= 0) return;
    const count = Math.min(3, remain);
    const start = Date.now();
    const next = [...images];
    for (let index = 1; index <= count; index += 1) {
      const seed = `sylvie-admin-${start}-${index}`;
      next.push({
        url: `https://picsum.photos/seed/${seed}/800/1067`,
        thumbUrl: `https://picsum.photos/seed/${seed}/400/533`,
        watermarkUrl: `https://picsum.photos/seed/${seed}/800/1067?blur=2`,
        width: 800,
        height: 1067,
        filename: `sample-${index}.jpg`,
      });
    }
    onImagesChange(next);
    if (!coverUrl) {
      onCoverChange(next[0]?.url ?? '');
    }
  };

  return (
    <div className="panel">
      <div className="p-title">
        媒体工作台
        <span className="n">
          图片 {images.length} / 99 · 视频 {videos.length} / 3
        </span>
        <span className="ml-auto text-[11px] text-t3">
          编号即前台展示顺序 · 封面：第 {coverIndex} 张
        </span>
      </div>

      <div className="p-4">
        <div className="tabs mb-3">
          <button type="button" className={tab === 'img' ? 'on' : ''} onClick={() => setTab('img')}>
            图片（{images.length}）
          </button>
          <button type="button" className={tab === 'vid' ? 'on' : ''} onClick={() => setTab('vid')}>
            视频（{videos.length}）
          </button>
        </div>

        {tab === 'img' ? (
          <div>
            <div
              className="up-zone"
              onClick={() => imageInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void uploadImages(event.dataTransfer.files);
              }}
            >
              点击或拖拽图片到此处批量上传
              <br />
              支持 jpg / png / webp，单张 ≤ 20MB · 最多 99 张
              {uploadingImages > 0 ? (
                <div className="mt-2 text-brand2">正在上传 {uploadingImages} 张…</div>
              ) : null}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                if (event.target.files) {
                  void uploadImages(event.target.files);
                  event.target.value = '';
                }
              }}
            />

            <div className="mt-2 text-right text-[11.5px] text-t3">
              没有素材？
              <button type="button" className="ml-1 text-brand2" onClick={addSamples}>
                添加 3 张示例图
              </button>
            </div>

            <div className="thumb-grid">
              {images.map((image, index) => (
                <div
                  key={`${image.url}-${index}`}
                  className={`thumb-card ${
                    dragIndex === index ? 'opacity-40' : ''
                  } ${overIndex === index && dragIndex !== index ? 'ring-2 ring-brand' : ''}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setOverIndex(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragIndex !== null) moveImage(dragIndex, index);
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                >
                  <img src={image.thumbUrl ?? image.url} alt={`第 ${index + 1} 张`} />
                  <span className="idx">{index + 1}</span>
                  {coverUrl === image.url ? <span className="cover">封面</span> : null}
                  <div className="ops">
                    <button type="button" title="预览" onClick={() => onPreview(index)}>
                      <Eye size={12} />
                    </button>
                    <button type="button" title="设为封面" onClick={() => onCoverChange(image.url)}>
                      <Star size={12} fill={coverUrl === image.url ? 'currentColor' : 'none'} />
                    </button>
                    <button type="button" title="前移" onClick={() => moveImage(index, index - 1)}>
                      <ChevronLeft size={12} />
                    </button>
                    <button type="button" title="后移" onClick={() => moveImage(index, index + 1)}>
                      <ChevronRight size={12} />
                    </button>
                    <button type="button" title="移除" onClick={() => removeImage(index)}>
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div
              className="up-zone"
              onClick={() => videoInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void uploadVideos(event.dataTransfer.files);
              }}
            >
              点击或拖拽视频到此处上传
              <br />
              支持 mp4 / mov / webm，单个 ≤ 500MB · 最多 3 个
              {uploadingVideos > 0 ? (
                <div className="mt-2 text-brand2">正在上传 {uploadingVideos} 个视频…</div>
              ) : null}
            </div>
            <input
              ref={videoInputRef}
              type="file"
              multiple
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(event) => {
                if (event.target.files) {
                  void uploadVideos(event.target.files);
                  event.target.value = '';
                }
              }}
            />

            <div className="mt-3 space-y-2">
              {videos.map((video, index) => (
                <div
                  key={`${video.url}-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-line bg-panel2 px-3 py-2.5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-black/40 text-brand2">
                    <Film size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px]">
                      {video.filename ?? filenameFromUrl(video.url)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-t3">
                      {video.size ? formatFileSize(video.size) : '—'} · 视频
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      const next = [...videos];
                      const [item] = next.splice(index, 1);
                      if (item && index > 0) next.splice(index - 1, 0, item);
                      onVideosChange(next);
                    }}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      const next = [...videos];
                      const [item] = next.splice(index, 1);
                      if (item && index < next.length) next.splice(index + 1, 0, item);
                      onVideosChange(next);
                    }}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn-text hover:text-[#ff8194]"
                    onClick={() => onVideosChange(videos.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {videos.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-t3">暂无视频</p>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-1 text-[11.5px] leading-relaxed text-t3">
          <p>· 缩略图上的编号即前台详情页展示顺序，可拖拽或使用 ‹ › 微调</p>
          <p>· 点击 ★ 指定封面；未指定时默认取第 1 张</p>
          <p>· 点击 👁 打开大图预览，可用方向键逐张检查</p>
        </div>
      </div>

      {uploadingImages > 0 || uploadingVideos > 0 ? (
        <div className="flex items-center gap-2 border-t border-line px-4 py-2 text-[11.5px] text-t3">
          <Upload size={12} />
          上传中，请勿关闭页面
        </div>
      ) : null}
    </div>
  );
}
