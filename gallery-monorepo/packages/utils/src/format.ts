/**
 * 格式化纯函数：只做字符串 / 数值转换，无副作用、无外部依赖。
 * 时间类函数按后端返回的北京时间字符串直接切片，不做时区换算。
 */

/**
 * 仅保留日期部分：`2026-11-07 12:00:00` → `2026-11-07`。
 * @param value 后端时间字符串；空值 / `null` / `undefined` 返回占位符 `—`。
 * @returns 前 10 位日期字符串；不校验格式合法性。
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return value.slice(0, 10);
}

/**
 * 日期时间（到分钟）：`2026-11-07 12:00:00` → `2026-11-07 12:00`。
 * @param value 后端时间字符串；空值返回 `—`。
 * @returns 前 16 位字符串；后端按北京时间存储，故不做时区偏移。
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return value.slice(0, 16);
}

/**
 * 数字缩写（中文单位）：`1260` → `1.3k`，`12345` → `1.2w`。
 * 千位 / 万位均保留一位小数（四舍五入），如 `9999` → `10.0k`、`99999` → `10.0w`。
 * @param value 数量；`null` / `undefined` 按 0 处理。
 * @returns 小于 1000 时返回原数字的字符串。
 */
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

/**
 * 文件体积：字节 → `B` / `KB` / `MB`，换算基数 1024，保留一位小数（四舍五入）。
 * 超过 1GB 仍以 MB 展示；负数按 `B` 原样输出。
 * @param bytes 字节数。
 * @returns 带单位的可读体积。
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 分 → 元（人民币）：`1900` → `¥19`；`1520` → `¥15.2`。
 * 整数元不显示小数；非整数固定一位小数（四舍五入，如 `1555` → `¥15.6`）。
 * 项目约定金额在数据库与 DTO 中统一以「分」存储，展示时使用本函数。
 * @param cents 金额（分）。
 * @returns 带 `¥` 前缀的展示字符串。
 */
export function formatPrice(cents: number): string {
  const yuan = cents / 100;
  return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(1)}`;
}

/**
 * 文字头像：取昵称前两个字符（按 Unicode 字符切分，中文不会被截断字节）。
 * 先 `trim` 去首尾空白，结果统一转大写；空字符串 / 纯空白返回默认字 `希`。
 * @param name 昵称。
 * @returns 1-2 个字符的文字头像。
 */
export function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '希';
  }
  return Array.from(trimmed).slice(0, 2).join('').toUpperCase();
}

/**
 * 轻量 className 合并：过滤 `false` / `null` / `undefined` 后用空格拼接。
 * 不支持 Tailwind 冲突去重；需要时自行保证类名顺序，避免为此引入额外依赖。
 * @param values 任意数量的类名片段。
 * @returns 合并后的 className。
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * 时长展示：秒数 → `分:秒`（各两位，如 `75` → `01:15`）。
 * 向下取整秒数，负数按 0 处理；`null` / `undefined` 视为 0。
 * 不支持小时段，超过 60 分钟时分钟位继续累加（如 `3661` → `61:01`）。
 * @param seconds 时长（秒）。
 * @returns `mm:ss` 格式字符串。
 */
export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
