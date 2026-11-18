import type { EffectiveRole, PageResult, Role } from '@sylvie/types';

/** 付费会员是否仍在有效期内。 */
export function isVipActive(vipExpireAt: string | null | undefined, now = new Date()): boolean {
  if (!vipExpireAt) {
    return false;
  }
  return new Date(vipExpireAt.replace(' ', 'T')).getTime() > now.getTime();
}

/** 有效角色：vip 到期后降级为 member；admin 不受影响。 */
export function effectiveRole(
  role: Role,
  vipExpireAt: string | null | undefined,
  now = new Date(),
): EffectiveRole {
  if (role === 'admin') {
    return 'admin';
  }
  if (role === 'vip' && isVipActive(vipExpireAt, now)) {
    return 'vip';
  }
  return 'member';
}

/** 分页参数归一化：page 最小 1，pageSize 限制在 1-48。 */
export function normalizePage(page?: number, pageSize?: number, fallbackSize = 24): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const safePage = Math.max(1, Math.floor(page ?? 1));
  const safeSize = Math.min(48, Math.max(1, Math.floor(pageSize ?? fallbackSize)));
  return { page: safePage, pageSize: safeSize, offset: (safePage - 1) * safeSize };
}

export function toPageResult<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number,
): PageResult<T> {
  return {
    list,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 生成展示订单号：SV + 时间戳 + 4 位随机数。 */
export function createOrderNo(): string {
  const now = new Date();
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `SV${stamp}${random}`;
}

/** MySQL DECIMAL 以字符串返回，统一转 number。 */
export function toNumber(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

/** 把 MySQL 的 0/1 转成 boolean。 */
export function toBool(value: unknown): boolean {
  return value === 1 || value === '1' || value === true;
}
