interface AvatarBoxProps {
  name: string;
  initial?: string;
  color?: string;
  avatarUrl?: string | null;
  size?: number;
  rounded?: number;
}

/** 后台头像：方形圆角，上传图片或渐变底色 + 首字。 */
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
