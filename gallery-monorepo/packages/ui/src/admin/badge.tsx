/**
 * 后台状态徽章。
 *
 * 外观完全由后台全局类 `.badge` / `.badge-{tone}` 决定，本包不内置颜色值；
 * 宿主需在后台样式中定义这些类。前台没有对应的徽章组件。
 */
import type { ReactNode } from 'react';

/** 徽章色调，对应后台全局类 `badge-green` 等。 */
export type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'brand';

/**
 * 后台状态徽章：配色由后台主题的 `badge-*` 类决定。
 *
 * @param tone 色调，默认 `gray`
 * @param children 徽章文案
 */
export function Badge({ tone = 'gray', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/**
 * 图集状态徽章：已发布 / 草稿 / 已下架。
 *
 * 映射关系：`published` → 绿色「已发布」，`draft` → 灰色「草稿」，
 * `offline` → 红色「已下架」。状态值来自 `album.status` 枚举。
 *
 * @param status 图集状态
 */
export function AlbumStatusBadge({ status }: { status: 'draft' | 'published' | 'offline' }) {
  if (status === 'published') return <Badge tone="green">已发布</Badge>;
  if (status === 'draft') return <Badge tone="gray">草稿</Badge>;
  return <Badge tone="red">已下架</Badge>;
}
