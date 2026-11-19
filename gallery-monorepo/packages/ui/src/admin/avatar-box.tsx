/**
 * 后台头像块。
 *
 * 与前台 `Avatar` / `AuthorAvatar` 的圆形头像不同，后台统一使用方形圆角，
 * 便于在密集表格中排列。不依赖任何后台全局类，尺寸与圆角由 props 内联控制；
 * 仅边框使用 `border-white/10`。
 */
interface AvatarBoxProps {
  name: string;
  initial?: string;
  color?: string;
  avatarUrl?: string | null;
  size?: number;
  rounded?: number;
}

/**
 * 后台头像：方形圆角，上传图片或渐变底色 + 首字。
 *
 * 有 `avatarUrl` 时优先显示图片（不校验地址合法性），否则显示 `initial`
 * 或 `name` 首字；底色由单色 `color` 派生 60% 透明度的渐变。
 *
 * @param name 名称，作为 `title` 提示与首字兜底
 * @param initial 自定义首字，省略时取 `name.slice(0, 1)`
 * @param color 渐变基色，默认 `#3a3a44`
 * @param avatarUrl 头像图片地址，可为 `null`
 * @param size 边长（px），默认 36
 * @param rounded 圆角（px），默认 8，保证方形而非圆形
 */
export function AvatarBox({
  name,
  initial,
  color,
  avatarUrl,
  size = 36,
  rounded = 8,
}: AvatarBoxProps) {
  const background = `linear-gradient(135deg, ${color ?? '#3a3a44'}, ${color ?? '#3a3a44'}99)`;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/10 font-bold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        background,
        fontSize: size * 0.36,
      }}
      title={name}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        initial || name.slice(0, 1)
      )}
    </span>
  );
}
