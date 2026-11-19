# @sylvie/types

希尔薇图集前后台共享的 TypeScript 类型、DTO 与业务枚举常量，是 API 响应与 Web / Admin 调用之间的唯一契约来源。

## 目录结构

```
packages/types/
├── src/
│   ├── common.ts      # ApiResponse、PageResult 通用响应结构
│   ├── constants.ts   # 角色、排序、公告/通知、订单、支付、评论状态等枚举与常量
│   ├── dto.ts         # 前台 DTO（用户、图集、评论、通知、订单、签到等）
│   ├── admin.ts       # 管理后台 DTO、看板/趋势、操作日志动作映射
│   └── index.ts       # 汇总导出入口
├── package.json
└── tsconfig.json
```

## 在 workspace 中引入

在应用或包的 `package.json` 中添加：

```json
{
  "dependencies": {
    "@sylvie/types": "workspace:*"
  }
}
```

类型通常写在 `dependencies`（API 运行时也使用 `ROLE`、`MAX_AVATAR_BYTES` 等常量）；包构建产物位于 `dist/`，由 Turbo 的 `dependsOn: ["^build"]` 保证先构建再使用。

## 使用示例

```ts
import type {
  ApiResponse,
  PageResult,
  AlbumCardDto,
  AlbumDetailDto,
  AdminAlbumRow,
} from '@sylvie/types';
import { ROLE, ORDER_STATUS, FREE_PREVIEW_COUNT } from '@sylvie/types';

// 统一响应 + 分页
const res: ApiResponse<PageResult<AlbumCardDto>> = await fetch('/api/albums').then((r) => r.json());
const [first] = res.data.list;

// 权益判断：付费会员或已解锁
const canViewAll = user.effectiveRole === ROLE.VIP || album.unlocked;

// 状态比较使用常量，避免散落魔法字符串
if (order.status === ORDER_STATUS.PAID) {
  // ...
}

// 未解锁预览张数
const preview = album.images.slice(0, FREE_PREVIEW_COUNT);
```

## 导出概览

| 模块 | 主要导出 | 说明 |
|---|---|---|
| `common.ts` | `ApiResponse<T>`、`PageResult<T>` | 全站统一响应与分页结构 |
| `constants.ts` | `ROLE` / `Role` / `ROLE_LABELS`、`SORT_TYPE` / `SortType`、`ANNOUNCEMENT_TYPE`、`NOTIFICATION_TYPE`、`ORDER_STATUS`、`PAY_TYPE`、`COMMENT_STATUS`、`FREE_PREVIEW_COUNT`、`AVATAR_PRESETS`、`MAX_AVATAR_BYTES`、`ALBUM_PAGE_SIZE` | 枚举取值、联合类型与中文标签 |
| `dto.ts` | `UserProfile`、`AuthResult`、`AlbumCardDto`、`AlbumDetailDto`、`AlbumImageDto`、`CommentDto`、`AuthorDto`、`TagDto`、`AnnouncementDto`、`NotificationDto`、`MembershipPlanDto`、`OrderDto`、`UnlockDto`、`PurchaseData`、`CheckinResult`、`SiteBootstrap` 等 | 前台接口 DTO |
| `admin.ts` | `AdminProfile`、`AdminAlbumRow` / `AdminAlbumSaveInput`、`AdminTagRow`、`AdminAuthorRow`、`AdminCommentRow`、`AdminOrderPage`、`AdminUserPage`、`AdminConfigBundle`、`AdminLogRow`、`AdminDashboard`、`AdminTrend`、`AdminAgentTokenRow`、`ADMIN_ACTION_LABELS`、`ADMIN_ACTION_GROUPS` | 后台接口 DTO 与日志动作映射 |

## 设计约定

- **命名与数据库映射**：DTO 字段使用 camelCase，数据库列为 snake_case，由 API 服务层负责转换；类型本身不感知表名。
- **金额单位**：所有金额字段以「分」表示（如 `priceCents`、`amountCents`、`totalSpentCents`），展示时用 `@sylvie/utils` 的 `formatPrice`。
- **时间格式**：字段为后端返回的北京时间字符串（`YYYY-MM-DD HH:mm:ss`），可为空的用 `string | null`；不在类型层做时区转换。
- **角色**：`role` 是数据库角色，`effectiveRole` 是考虑 VIP 到期后的实际角色；`guest` 不落库，仅前端表达未登录。
- **枚举**：状态字段在 DTO 中使用联合类型（如 `OrderStatus`），与 `constants.ts` 的取值一一对应；新增取值需同步 SQL、API 与两个前端。
- **分页**：统一使用 `{ list, total, page, pageSize, totalPages }`；`totalPages` 由后端计算。部分后台接口在 `PageResult` 上扩展汇总字段（如 `AdminOrderPage.summary`）。
- **软删除**：`CommentStatus` 含 `deleted`，图集状态含 `offline`，不要用物理删除语义。
- **纯类型包**：除少量常量外不包含运行时代码，也不依赖 React / Node；相对导入保留 `.js` 后缀以配合 ESM 与 `moduleResolution: Bundler`。
- **同步要求**：修改接口字段时先改本包，再同步 `apps/api` 的响应模型与 Web / Admin 调用。

## 验证

```bash
pnpm --filter @sylvie/types typecheck
pnpm --filter @sylvie/types build
pnpm --filter @sylvie/types lint
```

也可在仓库根目录运行 `pnpm typecheck` / `pnpm build` / `pnpm lint`，由 Turbo 调度依赖包。
