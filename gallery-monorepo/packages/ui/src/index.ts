/**
 * `@sylvie/ui` 根入口：只导出无样式逻辑。
 *
 * 这里的内容不依赖任何视觉主题，也不引用 React 组件或 `next/link`，
 * 因此可以被前台、后台乃至任意 React 项目复用。视觉组件分别位于：
 * - `@sylvie/ui/web`：前台 Tailwind 主题组件；
 * - `@sylvie/ui/admin`：后台 `.page-head` / `.pager` / `.modal-*` 等全局类组件。
 *
 * 两个视觉入口的样式命名空间刻意隔离，请勿在根入口重新导出它们。
 */
export * from './common/pagination.js';
export * from './common/hooks.js';
