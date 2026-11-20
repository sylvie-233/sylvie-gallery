/**
 * 允许 App Router 直接导入全局 CSS（如 `import './globals.css'`）。
 *
 * Next.js 在构建阶段处理样式文件，TypeScript 只需放行模块解析；
 * TS 7 nightly 默认开启 side-effect 导入检查，因此显式声明。 */
declare module '*.css';
