import type { ReactNode } from 'react';

export type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'brand';

/** 后台状态徽章：配色由后台主题的 `badge-*` 类决定。 */
export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** 图集状态徽章：已发布 / 草稿 / 已下架。 */
export function AlbumStatusBadge({ status }: { status: 'draft' | 'published' | 'offline' }) {
  if (status === 'published') return <Badge tone="green">已发布</Badge>;
  if (status === 'draft') return <Badge tone="gray">草稿</Badge>;
  return <Badge tone="red">已下架</Badge>;
}
