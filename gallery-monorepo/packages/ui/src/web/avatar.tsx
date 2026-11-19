/**
 * 前台头像组件。
 *
 * 与后台 `AvatarBox` 的区别：这里统一为圆形，用户头像可选 8 套预设渐变，
 * 作者头像取后台配置的单一品牌色；后台头像则是方形圆角。样式依赖前台主题
 * 的 `border-line` 等工具类，不要与 admin 命名空间混用。
 */
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

/**
 * 用户头像：有自定义图片时显示图片，否则用 `AVATAR_PRESETS` 中的渐变底
 * 加昵称首字（`avatarInitials` 处理中英文）。
 *
 * @param nickname 昵称，同时作为图片 `alt` 与首字来源
 * @param avatarType 头像类型，`1` 表示自定义图片，其他值使用预设渐变
 * @param avatarIndex 预设渐变序号，按 `AVATAR_PRESETS.length` 取模，越界安全
 * @param avatarUrl 自定义头像地址；与 `avatarType === 1` 同时生效
 * @param size 头像边长（px），默认 36；字号按比例缩放
 * @param className 追加到根节点的类名（如定位或阴影）
 */
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
        <img
          src={avatarUrl}
          alt={nickname}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
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

/**
 * 作者头像：后台上传的图片或单一品牌色渐变底 + 首字。
 *
 * 只有 `http(s)` 外链或 `/api/` 代理地址才会渲染 `<img>`，其余字符串视为
 * 非法图片并回落到首字，避免后台配置脏数据时出现破图。
 * 图片使用懒加载与异步解码。
 *
 * @param name 作者名，作为 `alt` 与首字来源
 * @param initial 后台配置的首字；为空时取 `name` 第一个字符
 * @param color 渐变底色基色，会派生 60% 透明度的第二段渐变
 * @param avatarUrl 头像地址，需匹配 `^https?:` 或 `^/api/`
 * @param size 头像边长（px），默认 36
 * @param className 追加到根节点的类名
 */
export function AuthorAvatar({
  name,
  initial,
  color,
  avatarUrl,
  size = 36,
  className,
}: AuthorAvatarProps) {
  const hasImage = Boolean(avatarUrl && /^https?:|^\/api\//.test(avatarUrl));
  const style = hasImage
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
      {hasImage ? (
        <img
          src={avatarUrl ?? ''}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        initial || name.slice(0, 1)
      )}
    </span>
  );
}
