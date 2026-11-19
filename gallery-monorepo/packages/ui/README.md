# @sylvie/ui

希尔薇共享 UI 组件。按用途分为三个入口，**Web 与 Admin 的视觉组件刻意分开**：同样叫 `Pagination`，外观与交互密度完全不同，不强行合并。

## 入口

| 入口 | 内容 | 适用 |
|---|---|---|
| `@sylvie/ui` | 无样式工具：`buildPageItems`、`useBodyScrollLock`、`useNavigationKeys` | 任意 React 项目 |
| `@sylvie/ui/web` | 前台视觉组件：Logo、EmptyState、SectionHead、Pagination、Avatar、AuthorAvatar、CoverImage、各类骨架屏 | Next.js 前台（依赖 `next/link`） |
| `@sylvie/ui/admin` | 后台视觉组件：PageHead、Tabs、SearchBox、Pagination、Modal、Empty、Badge、AlbumStatusBadge、AvatarBox、LoadingRows、PageError、ResultCount | 桌面端管理后台（Vite / React） |

## 使用

```ts
// 纯工具
import { buildPageItems, useBodyScrollLock } from '@sylvie/ui';

// 前台
import { EmptyState, Pagination } from '@sylvie/ui/web';

// 后台
import { Modal, Tabs, PageHead } from '@sylvie/ui/admin';
```

## 约定

- **只放可复用组件**：依赖应用状态（auth、SWR、路由、后台日期工具）的组件留在各自应用。
- **样式命名空间隔离**：`web` 与 `admin` 使用各自的 Tailwind 主题与全局类（如 `panel`、`pager`、`masonry`），互不引用。
- **Tailwind 扫描**：应用侧需在 CSS 中声明 `@source` 指向对应子目录，例如
  `@source '../../../packages/ui/src/admin';`。
- **不声明 `tailwindcss` 依赖**：本包不含 CSS 入口，也不调用 Tailwind；样式由宿主应用编译。宿主必须使用 Tailwind CSS v4，并提供组件依赖的设计 token（`--color-panel`、`--color-t1..t3`、`--color-brand` 等）。若宿主缺少对应 token，类名不会报错，只是视觉降级。
- Web 入口构建时会自动加上 `"use client"`，可直接在 Next.js App Router 中引用。
- 组件不内置业务文案以外的国际化，文案由调用方传入或使用现有中文默认值。
