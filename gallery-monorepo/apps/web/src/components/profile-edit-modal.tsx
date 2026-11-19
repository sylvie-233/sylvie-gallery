'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';

import { AVATAR_PRESETS, MAX_AVATAR_BYTES, type UserProfile } from '@sylvie/types';
import { avatarInitials, cn } from '@sylvie/utils';
import { useBodyScrollLock, useNavigationKeys } from '@sylvie/ui';

import { apiFetch, apiUpload } from '@/lib/api';
import { revalidateAll, useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

interface ProfileEditModalProps {
  open: boolean;
  user: UserProfile;
  onClose: () => void;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ProfileEditModal({ open, user, onClose }: ProfileEditModalProps) {
  const { setProfile } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nickname, setNickname] = useState(user.nickname);
  const [avatarType, setAvatarType] = useState(user.avatarType);
  const [avatarIndex, setAvatarIndex] = useState(user.avatarIndex);
  const [previewUrl, setPreviewUrl] = useState<string | null>(user.avatarUrl);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }
    setNickname(user.nickname);
    setAvatarType(user.avatarType);
    setAvatarIndex(user.avatarIndex);
    setPreviewUrl(user.avatarType === 1 ? user.avatarUrl : null);
    setFile(null);
    setError('');
  }, [open, user]);

  useBodyScrollLock(open);
  useNavigationKeys({ onEscape: onClose }, open);

  if (!open) {
    return null;
  }

  const pickPreset = (index: number) => {
    setAvatarType(0);
    setAvatarIndex(index);
    setFile(null);
    setPreviewUrl(null);
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  };

  const pickFile = (selected: File | undefined) => {
    if (!selected) {
      return;
    }
    if (!ALLOWED_TYPES.includes(selected.type)) {
      toast('仅支持 jpg / png / webp 格式', 'error');
      return;
    }
    if (selected.size > MAX_AVATAR_BYTES) {
      toast('头像大小不能超过 2MB', 'error');
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setAvatarType(1);
    setError('');
  };

  const save = async () => {
    const nameLength = Array.from(nickname.trim()).length;
    if (nameLength < 1 || nameLength > 16) {
      setError('昵称需为 1-16 个字符');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        await apiUpload<UserProfile>('/api/auth/avatar', formData);
      }
      const profile = await apiFetch<UserProfile>('/api/auth/profile', {
        method: 'PATCH',
        body: {
          nickname: nickname.trim(),
          avatarType,
          avatarIndex,
        },
      });
      setProfile(profile);
      toast('资料已更新', 'success');
      void revalidateAll();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose} role="presentation">
      <div
        className="modal-card max-w-[480px] p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="编辑资料"
      >
        <div className="mb-5 flex items-center">
          <h2 className="text-[17px] font-bold">编辑资料</h2>
          <button
            type="button"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-t3 transition hover:bg-white/5 hover:text-t1"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs text-t3">头像</p>
            <div className="flex items-center gap-4">
              <span
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/15 font-bold text-white"
                style={
                  avatarType === 1 && previewUrl
                    ? undefined
                    : {
                        background: AVATAR_PRESETS[avatarIndex % AVATAR_PRESETS.length],
                        fontSize: 24,
                      }
                }
              >
                {avatarType === 1 && previewUrl ? (
                  <img src={previewUrl} alt="头像预览" className="h-full w-full object-cover" />
                ) : (
                  avatarInitials(nickname)
                )}
              </span>
              <div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={13} />
                  上传自定义头像
                </button>
                <p className="mt-2 text-[11px] text-t3">jpg / png / webp，≤ 2MB</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => pickFile(event.target.files?.[0])}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2.5">
              {AVATAR_PRESETS.map((background, index) => (
                <button
                  key={background}
                  type="button"
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 font-bold text-white transition hover:-translate-y-0.5',
                    avatarType === 0 && avatarIndex === index
                      ? 'border-white shadow-[0_0_0_3px_rgba(255,45,85,.28)]'
                      : 'border-transparent opacity-75 hover:opacity-100',
                  )}
                  style={{ background, fontSize: 14 }}
                  onClick={() => pickPreset(index)}
                  aria-label={`使用预设头像 ${index + 1}`}
                >
                  {avatarInitials(nickname)}
                </button>
              ))}
            </div>
            {avatarType === 1 && previewUrl ? (
              <button
                type="button"
                className="mt-3 text-[11.5px] text-t3 transition hover:text-brand2"
                onClick={() => pickPreset(avatarIndex)}
              >
                切回预设色卡
              </button>
            ) : null}
          </div>

          <label className="block">
            <span className="mb-1.5 flex items-center text-xs text-t3">
              昵称
              <span className="ml-auto tabular-nums">{Array.from(nickname).length}/16</span>
            </span>
            <input
              className="input"
              value={nickname}
              maxLength={16}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="1-16 个字符"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-t3">邮箱（登录账号，不可修改）</span>
            <input className="input opacity-60" value={user.email} readOnly disabled />
          </label>

          {error ? <p className="text-xs leading-relaxed text-brand2">{error}</p> : null}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-brand" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
