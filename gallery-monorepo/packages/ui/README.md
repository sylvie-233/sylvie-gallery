# @sylvie/ui

希尔薇图集的共享 UI 层：把前台（Next.js）与后台（Vite）之间真正通用、又不携带业务状态的部分集中在这里，避免两个应用各写一份。

本包**不包含 CSS 入口、不调用 Tailwind、不声明 `tailwindcss` 依赖**，所有样式都由宿主应用编译。视觉组件刻意按前台 / 后台拆成两个命名空间，同样叫 `Pagination`，外观与交互密度完全不同，不强行合并。

## 三入口设计

| 入口 | 产物 | 内容 | 适用 |
|---|---|---|---|
| `@sylvie/ui` | `dist/index.js` | 无样式工具：分页算法与浮层 Hook | 任意 React 项目 |
| `@sylvie/ui/web` | `dist/web.js` | 前台视觉组件，构建时自动注入 `"use client";` | Next.js App Router 前台（依赖 `next/link`） |
| `@sylvie/ui/admin` | `dist/admin.js` | 后台视觉组件，面向桌面端 | React + Vite 管理后台 |

这样拆分的原因：

- **依赖隔离**：根入口不引入 React 组件，也不引入 `next/link`；后台不需要为了用一个分页函数而打包 Next.js 依赖。`package.json` 中 `next` 是可选 peer。
- **样式隔离**：`web` 组件使用前台 Tailwind 主题工具类与 `panel` / `masonry` / `skeleton` 等全局类；`admin` 组件使用后台 `.page-head` / `.seg` / `.tabs` / `.pager` / `.empty` / `.badge-*` / `.modal-*` 等全局类。两套类名在各自应用之外没有定义。
- **构建边界**：只有 `web` 产物注入 `"use client";`，因为它会被 App Router 直接引用；`admin` 面向纯客户端应用，带上该指令反而多余。

## 目录结构

```text
packages/ui/
├── src/
│   ├── index.ts              # 根入口：导出 common/*
│   ├── common/
│   │   ├── pagination.ts     # PageItem / buildPageItems
│   │   └── hooks.ts          # useBodyScrollLock / useNavigationKeys
│   ├── web/
│   │   ├── index.ts          # 前台入口
│   │   ├── avatar.tsx        # Avatar / AuthorAvatar
│   │   ├── cover-image.tsx   # CoverImage
│   │   ├── empty-state.tsx   # EmptyState
│   │   ├── logo.tsx          # Logo
│   │   ├── pagination.tsx    # Pagination（前台外观）
│   │   ├── section-head.tsx  # SectionHead
│   │   └── skeletons.tsx     # 各类骨架屏
│   └── admin/
│       ├── index.ts          # 后台入口
│       ├── avatar-box.tsx    # AvatarBox
│       ├── badge.tsx         # Badge / AlbumStatusBadge
│       ├── feedback.tsx      # Empty / LoadingRows / PageError / ResultCount
│       ├── modal.tsx         # Modal
│       ├── page-head.tsx     # PageHead
│       ├── pagination.tsx    # Pagination（后台外观）
│       ├── search-box.tsx    # SearchBox
│       └── tabs.tsx          # Tabs
├── tsup.config.ts            # 三入口 ESM 构建
├── tsconfig.json
└── eslint.config.js
```

## 引入方式

```ts
// 纯工具（无样式、无 React 组件）
import { buildPageItems, useBodyScrollLock, useNavigationKeys } from '@sylvie/ui';

// 前台视觉组件
import { Logo, EmptyState, Pagination, AlbumGridSkeleton } from '@sylvie/ui/web';

// 后台视觉组件
import { PageHead, Tabs, Modal, AlbumStatusBadge } from '@sylvie/ui/admin';
```

使用示例：

```tsx
// 前台：空态 + 分页（受控）
import { EmptyState, Pagination } from '@sylvie/ui/web';

function AlbumSection({ page, totalPages, onChange, albums }: AlbumSectionProps) {
  if (albums.length === 0) {
    return <EmptyState title="暂无图集" text="稍后再来看看" />;
  }
  return <Pagination page={page} totalPages={totalPages} onChange={onChange} />;
}
```

```tsx
// 后台：标题行 + 搜索；提交中禁用弹窗关闭
import { Modal, SearchBox, PageHead } from '@sylvie/ui/admin';

<PageHead title="图集管理" sub={`共 ${total} 套`}>
  <SearchBox value={keyword} onChange={setKeyword} onSearch={onSearch} placeholder="搜索标题" />
</PageHead>;

<Modal open={creating} title="新建图集" onClose={onClose} closable={!submitting}>
  <CreateAlbumForm />
</Modal>;
```

## 组件与工具清单

### `@sylvie/ui`（无样式）

| 导出 | 类型 | 说明 |
|---|---|---|
| `PageItem` | 类型 | `number \| '...'`，分页项 |
| `buildPageItems(page, totalPages)` | 函数 | 生成页码序列：≤7 页全量展示，否则保留首尾与当前页相邻页 |
| `useBodyScrollLock(active?)` | Hook | 锁定 / 恢复 `body.overflow`，由浮层 `open` 驱动 |
| `NavigationKeys` | 类型 | `onEscape` / `onPrev` / `onNext` 回调集合 |
| `useNavigationKeys(keys, enabled?)` | Hook | 监听 Esc 与左右方向键；回调经 ref 保存，避免重复绑定 |

### `@sylvie/ui/web`（前台）

| 导出 | 说明 |
|---|---|
| `Logo` | 「希」字渐变方块 + 可选文字，内部使用 `next/link` |
| `EmptyState` | 空态：图标 + 标题 + 说明 + 操作 |
| `SectionHead` | 分区标题 + 副标题 + 「查看全部」链接（`next/link`） |
| `Pagination` | 胶囊按钮分页，品牌色当前页；总页数 ≤1 不渲染 |
| `Avatar` | 圆形用户头像：8 套预设渐变或自定义图片 + 昵称首字 |
| `AuthorAvatar` | 圆形作者头像：品牌色渐变或图片 + 首字 |
| `CoverImage` | 图片统一入口：懒加载、骨架、淡入、失败回落 |
| `AlbumCardSkeleton` | 单张图集卡片骨架（支持瀑布流比例） |
| `AlbumGridSkeleton` | 图集网格 / 瀑布流骨架 |
| `AuthorCardSkeleton` | 作者卡骨架 |
| `AuthorGridSkeleton` | 作者网格骨架 |
| `TagCloudSkeleton` | 标签云骨架 |
| `NoticeListSkeleton` | 公告列表骨架 |
| `NotificationListSkeleton` | 站内通知列表骨架 |
| `PurchaseSkeleton` | 购买记录页骨架 |
| `AuthorDetailSkeleton` | 作者详情页骨架 |
| `DetailSkeleton` | 图集详情页骨架 |
| `HomeSkeleton` | 首页整页骨架 |

### `@sylvie/ui/admin`（后台）

| 导出 | 说明 |
|---|---|
| `PageHead` | 页面标题行：标题 + 计数副标题 + 右侧操作 |
| `Tabs<T>` | 筛选页签，支持可选计数徽章 |
| `SearchBox` | 受控搜索框，回车或点「搜索」触发 |
| `Pagination` | 紧凑分页条，样式由 `.pager` 决定 |
| `Modal` | Portal 弹窗：Esc 关闭、滚动锁定、`closable` 可禁用关闭 |
| `Empty` | 后台空态 |
| `LoadingRows` | 列表加载骨架 |
| `PageError` | 加载失败 + 重新加载 |
| `ResultCount` | 结果计数次要文字 |
| `Badge` / `BadgeTone` | 状态徽章与色调类型 |
| `AlbumStatusBadge` | 图集状态徽章：已发布 / 草稿 / 已下架 |
| `AvatarBox` | 方形圆角头像：图片或渐变底色 + 首字 |

## 样式与 Tailwind 约定

1. **应用侧必须声明 `@source`**，否则宿主 Tailwind 扫描不到本包的类名，组件会「裸奔」：

   ```css
   /* apps/web/src/app/globals.css */
   @import 'tailwindcss';
   @source '../../../../packages/ui/src/web';

   /* apps/admin/src/styles.css */
   @import 'tailwindcss';
   @source '../../../packages/ui/src/admin';
   ```

   路径是相对 CSS 文件自身的，新增消费方时按实际目录调整；不要指向整个 `packages/ui/src`，否则两个命名空间会互相污染。

2. **宿主必须提供设计 token**。本包直接使用前台 / 后台 `@theme` 中的颜色变量，例如：

   ```css
   @theme {
     --color-panel: #141417;
     --color-panel2: #1a1a1f;
     --color-line: #26262d;
     --color-line2: #34343d;
     --color-t1: #ececee;
     --color-t2: #9c9ca6;
     --color-t3: #6d6d78;
     --color-brand: #ff2d55;
     --color-brand2: #ff5b78;
   }
   ```

   组件还会用到宿主定义的全局类：前台有 `panel`、`section-title`、`skeleton`、`gradient-mark`、`cover-fallback`、`masonry`、`wrap`；后台有 `.page-head`、`.seg`、`.tabs`、`.pager`、`.empty`、`.badge-*`、`.btn*`、`.modal-mask`、`.modal-card`。缺少 token 时 Tailwind 不会报错，只是视觉降级；缺少这些全局类则对应组件会失去大部分外观。

3. **本包不声明 `tailwindcss` 依赖**：包内没有 CSS 入口，也没有构建期扫描，所有类名只是字符串。若在包内声明依赖，会诱导 pnpm 安装第二份 Tailwind，并让宿主版本与组件预期的 v4 语法产生偏差。宿主统一使用 Tailwind CSS v4 即可。

4. **`web` 入口的客户端边界**由 `tsup.config.ts` 的 banner 注入，源码文件本身不需要写 `"use client"`；`admin` 入口不注入，以便被 Vite 正常打包。

## 设计边界

**不要放进共享包：**

- 依赖应用状态的组件：登录会话（`useAuthStore`）、SWR 数据获取 / `revalidateAll`、路由（`next/navigation`、React Router）、后台日期与权限工具。
- 业务组件：图集卡片、作者卡、灯箱、上传器、支付面板等，它们携带接口字段与业务交互。
- 应用级布局：顶栏、侧栏、页脚，它们依赖导航配置与登录态。

**Web 与 Admin 不合并：**

- `Pagination` 两套都来自 `buildPageItems`，但外观、尺寸、当前页样式完全不同，属于有意重复。
- `EmptyState`（web）与 `Empty`（admin）、`Avatar`/`AuthorAvatar`（web，圆形）与 `AvatarBox`（admin，方形）同理。
- 同用途不同样式时，各自在对应子目录维护，不通过 `variant` 参数强行塞进一个组件。

## 新增组件流程

1. 判断归属：
   - 无 DOM / 无样式的逻辑 → `src/common/` 并从 `src/index.ts` 导出；
   - 依赖前台主题、`next/link` 或前台全局类 → `src/web/`；
   - 依赖后台 `.page-head` / `.pager` / `.modal-*` 等全局类 → `src/admin/`。
2. 新文件在对应 `index.ts` 追加 `export * from './xxx.js';`（注意 ESM 需带 `.js` 后缀）。
3. 补齐文件顶部职责说明与导出项的 `/** */`，写清 props、行为与样式命名空间依赖。
4. 若组件使用了新的全局类或 token，同步在应用侧 CSS 中定义，并确认 `@source` 已覆盖该子目录。
5. 避免引入新的运行时依赖；新增 peer 依赖需同时更新 `package.json` 与 `tsup.config.ts` 的 `external`。

验证命令（在 `gallery-monorepo/` 下执行）：

```bash
pnpm --filter @sylvie/ui typecheck
pnpm --filter @sylvie/ui build
pnpm --filter @sylvie/ui lint
```

构建产物为 `dist/index.js`、`dist/web.js`、`dist/admin.js` 及对应 `.d.ts`；改完共享组件后，Web / Admin 应用通过 workspace 直接引用，无需发布。
