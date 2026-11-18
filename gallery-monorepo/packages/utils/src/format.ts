/** 仅保留日期部分：2026-11-07 12:00:00 → 2026-11-07。 */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return value.slice(0, 10);
}

/** 日期时间：2026-11-07 12:00:00 → 2026-11-07 12:00。 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return value.slice(0, 16);
}

/** 数字缩写：1260 → 1.3k，12345 → 1.2w。 */
export function formatCount(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n >= 10000) {
    return `${(n / 10000).toFixed(1)}w`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

/** 文件体积：字节 → B / KB / MB。 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 分 → 元：1900 → ¥19；1520 → ¥15.2。 */
export function formatPrice(cents: number): string {
  const yuan = cents / 100;
  return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(1)}`;
}

/** 文字头像：取昵称前两个字符（中文按字符而非字节）。 */
export function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '希';
  }
  return Array.from(trimmed).slice(0, 2).join('').toUpperCase();
}

/** 轻量 className 合并，避免引入额外依赖。 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/** 把毫秒数写成 时:分:秒。 */
export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
