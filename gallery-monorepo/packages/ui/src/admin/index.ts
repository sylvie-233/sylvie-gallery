/**
 * `@sylvie/ui/admin` 后台视觉组件入口。
 *
 * 面向桌面端管理后台（React + Vite），依赖后台应用提供的 Tailwind 主题与
 * 全局类：`.page-head`、`.seg`、`.tabs`、`.pager`、`.empty`、`.badge-*`、
 * `.btn` / `.btn-line` / `.btn-sm`、`modal-mask` / `modal-card` 等；不依赖
 * `next/link`。前台 `@sylvie/ui/web` 的组件（`EmptyState`、`SectionHead`、
 * 各种 `*Skeleton`）样式命名空间不同，不要混用。
 *
 * 本入口不注入 `"use client";`（它面向 Vite 打包的纯客户端应用），
 * 若在 Next.js 中使用需自行包裹客户端边界。
 */
export * from './avatar-box.js';
export * from './badge.js';
export * from './feedback.js';
export * from './modal.js';
export * from './page-head.js';
export * from './pagination.js';
export * from './search-box.js';
export * from './tabs.js';
