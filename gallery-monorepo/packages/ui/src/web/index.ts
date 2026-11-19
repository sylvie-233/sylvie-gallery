/**
 * `@sylvie/ui/web` 前台视觉组件入口。
 *
 * 这些组件依赖前台 Web 应用的 Tailwind CSS v4 主题与全局类
 * （`panel`、`section-title`、`skeleton`、`gradient-mark`、`cover-fallback`、
 * `masonry`、`wrap` 等），以及 `--color-line` / `--color-t1..t3` / `--color-brand`
 * 等设计 token。请勿在 Admin（Vite）中引入本入口：后台使用另一套
 * `.page-head` / `.pager` / `.modal-*` 命名空间，两者不共享样式。
 *
 * 构建时 tsup 会为整个产物注入 `"use client";`，因此可在 Next.js App Router
 * 中直接引用；`Logo` 与 `SectionHead` 内部使用 `next/link`，故 `next`
 * 是本入口的 peer dependency（对根入口与 admin 入口为可选）。
 */
export * from './avatar.js';
export * from './cover-image.js';
export * from './empty-state.js';
export * from './logo.js';
export * from './pagination.js';
export * from './section-head.js';
export * from './skeletons.js';
