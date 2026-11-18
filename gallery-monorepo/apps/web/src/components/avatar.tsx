import { AVATAR_PRESETS } from '@sylvie/types';
import { avatarInitials, cn } from '@sylvie/utils';

interface AvatarProps {
  nickname: string;
  avatarType?: number;
  avatarIndex?: number;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

/** 用户头像：自定义图片或 8 套预设渐变底 + 昵称首字。 */
export function Avatar({
  nickname,
  avatarType = 0,
  avatarIndex = 0,
  avatarUrl,
  size = 36,
  className,
}: AvatarProps) {
  const style =
    avatarType === 1 && avatarUrl
      ? undefined
      : { background: AVATAR_PRESETS[avatarIndex % AVATAR_PRESETS.length], fontSize: size * 0.38 };

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 font-bold text-white',
        className,
      )}
      style={{ width: size, height: size, ...style }}
    >
      {avatarType === 1 && avatarUrl ? (
        <img src={avatarUrl} alt={nickname} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        avatarInitials(nickname)
      )}
    </span>
  );
}

interface AuthorAvatarProps {
  name: string;
  initial: string;
  color: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

/** 作者头像：后台上传图片或渐变底色 + 首字。 */
export function AuthorAvatar({
  name,
  initial,
  color,
  avatarUrl,
  size = 36,
  className,
}: AuthorAvatarProps) {
  const style =
    avatarUrl && /^https?:|^\/api\//.test(avatarUrl)
      ? undefined
      : {
          background: `linear-gradient(135deg, ${color}, ${color}99)`,
          fontSize: size * 0.36,
        };

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 font-bold text-white',
        className,
      )}
      style={{ width: size, height: size, ...style }}
    >
      {avatarUrl && /^https?:|^\/api\//.test(avatarUrl) ? (
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        initial || name.slice(0, 1)
      )}
    </span>
  );
}
