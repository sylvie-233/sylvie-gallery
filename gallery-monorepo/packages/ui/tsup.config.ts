/**
 * `@sylvie/ui` 构建配置。
 *
 * 三个入口分别产出独立产物，对应 package.json 的 exports：
 * - `index` → `@sylvie/ui`（无样式工具）；
 * - `web` → `@sylvie/ui/web`；
 * - `admin` → `@sylvie/ui/admin`。
 *
 * 所有入口都只产出 ESM，且把 React / Next / lucide-react 声明为 external，
 * 由宿主应用提供单实例，避免多份 React 导致 Hook 失效。
 * 只有 `web` 入口注入 `"use client";` 横幅：它直接面向 Next.js App Router；
 * 根入口与 admin 入口保持纯净（admin 面向 Vite 纯客户端应用）。
 * 本包不含 CSS 入口，样式由宿主 Tailwind 编译。
 */
import { defineConfig } from 'tsup';

/** 由宿主应用提供的运行时依赖，不打包进产物。 */
const external = [
  'react',
  'react-dom',
  'react-dom/client',
  'next',
  'next/link',
  'next/navigation',
  'lucide-react',
];

export default defineConfig([
  // 根入口：纯工具，不注入 "use client"。
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    target: 'es2022',
    external,
  },
  {
    entry: { web: 'src/web/index.ts' },
    format: ['esm'],
    dts: true,
    target: 'es2022',
    external,
    // Web 组件被 Next.js App Router 直接引用，需要标记客户端边界。
    banner: { js: '"use client";' },
  },
  // 后台入口：面向 Vite 客户端，不能带 "use client"（会破坏纯客户端打包）。
  {
    entry: { admin: 'src/admin/index.ts' },
    format: ['esm'],
    dts: true,
    target: 'es2022',
    external,
  },
]);
