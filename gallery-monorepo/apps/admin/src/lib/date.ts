export type TimeQuick = 'all' | 'today' | '7' | '30' | 'custom';

export interface TimeRange {
  quick: TimeQuick;
  from: string;
  to: string;
}

export const TIME_QUICK_LABELS: Record<TimeQuick, string> = {
  all: '全部时间',
  today: '今天',
  7: '近 7 天',
  30: '近 30 天',
  custom: '自定义',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function quickToRange(quick: TimeQuick): { from: string; to: string } {
  const today = new Date();
  if (quick === 'all' || quick === 'custom') {
    return { from: '', to: '' };
  }
  if (quick === 'today') {
    const value = toDateInput(today);
    return { from: value, to: value };
  }
  const days = quick === '7' ? 6 : 29;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
  return { from: toDateInput(start), to: toDateInput(today) };
}

export function rangeQuery(range: TimeRange): string {
  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  return params.toString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return value.slice(0, 10);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return value.slice(0, 16);
}

export function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function todayRange(): TimeRange {
  return { quick: 'today', ...quickToRange('today') };
}
