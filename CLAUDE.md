# CLAUDE.md

本文件为 Claude Code 在此代码库中工作时提供指导。

## 仓库定位

本仓库包含「希尔薇图集」v1 的设计文档与实现代码：`docs/` 为规格与原型，`scripts/` 为本地基础服务编排，`gallery-monorepo/` 为 pnpm + Turbo 工作区（前台 Web、独立管理后台 Admin、API）。管理后台与前台独立部署、独立登录，仅共用数据库。

## 文档职责对照

| 文件 | 职责 |
|---|---|
| `docs/美女写真网站-v1功能清单.md` | 前台功能与交互规格，按页面组织。文首 YAML frontmatter 用于 markmap 思维导图视图。 |
| `docs/美女写真网站-v1原型设计.html` | 前台交互原型：单文件自包含 HTML（内联 CSS/JS、演示数据，状态存 `localStorage`），浏览器直接打开即可。 |
| `docs/美女写真网站-v1数据库设计.sql` | MySQL 8 数据库设计：25 张表，文首为设计约定，文末为种子数据。 |
| `docs/美女写真网站-v1管理后台功能清单.md` | 管理后台规格。后台为独立应用，仅面向桌面端（≥1280px），与前台只共用数据库。 |
| `docs/美女写真网站-v1管理后台原型.html` | 管理后台原型，同样是单文件；登录层与前台独立。 |

跨文件保持一致是主要维护工作：修改规则或字段时，需同步更新 SQL（表结构、注释、种子数据）、对应功能清单，以及行为可见的两个原型。

## 代码结构

| 路径 | 职责 |
|---|---|
| `scripts/docker-compose.yml` | MySQL 8 + Redis 7.4 + RustFS + API + Web + Admin 编排；首次启动执行建表与演示数据。 |
| `manage.ps1` | 根目录运维脚本：up/down/restart/reset/build/logs/cli/status/init/pull/dev。 |
| `scripts/init/02-demo-data.sql` | 演示数据（37 套图集 / 1140 条媒体 / 公告 / 评论 / 收藏 / 订单），由 `scripts/generate-demo-data.mjs` 生成。 |
| `gallery-monorepo/apps/web` | Next.js 15 App Router 前台，Tailwind CSS v4 + SWR；通过 rewrites 代理 `/api`。 |
| `gallery-monorepo/apps/admin` | React + Vite + React Router 管理后台，Tailwind CSS v4 + SWR；全局客户端状态（登录会话、Toast、Confirm）用 Zustand；开发端口 3002。 |
| `gallery-monorepo/apps/api` | Hono API：JWT、Agent 令牌、MySQL 参数化查询、RustFS 对象存储、Sharp 图片处理、ZIP 下载、MCP。分层：`routes/` 用 `@hono/zod-openapi` 的 `createRoute` 声明接口 → `controllers/` 处理请求 → `services/` 编排业务 → `sql/` 构建参数化 SQL。`/api/docs` 为 Scalar 文档页，`/api/openapi.json` 由路由声明自动生成；`/api/mcp` 为 MCP Streamable HTTP 端点（见 `apps/api/MCP.md`）。 |
| `gallery-monorepo/packages/types` | API 响应、DTO、枚举常量；Web 与 API 共用。 |
| `gallery-monorepo/packages/db` | Drizzle schema（25 张表，`src/schema/`）、mysql2 连接池、事务与参数化查询封装。 |
| `gallery-monorepo/packages/ui` | 共享 UI：`@sylvie/ui`（分页计算、浮层滚动锁 / 键盘导航等无样式工具）、`@sylvie/ui/web`（前台视觉组件）、`@sylvie/ui/admin`（后台视觉组件）。样式不同但用途相同的组件分命名空间维护。 |
| `gallery-monorepo/packages/logger` | 基于 pino 的共享日志层：统一接口、敏感字段脱敏、开发彩色输出、`child` / `scope` 子日志。 |
| `gallery-monorepo/packages/cache` | 共享缓存层：内存 / Redis 双后端、`remember` 防击穿、固定窗口限流计数、前缀失效。 |
| `gallery-monorepo/packages/storage` | S3 / RustFS 共享对象存储层：建桶、健康检查、上传/读取/探测/删除，配置与 URL 规则由调用方注入。 |
| `gallery-monorepo/packages/utils` | 日期、计数、价格、文本格式化等纯函数。 |

## 本地开发

前置：Node.js ≥ 20、pnpm ≥ 9、Docker。

```bash
# 容器化一键启动（含三端）：前台 8080、后台 8081、API 3000
pwsh ./manage.ps1 up

# 或本地热更新：仅容器跑 MySQL + RustFS（可选 Redis），再启动三个 pnpm 服务
docker compose -f scripts/docker-compose.yml up -d mysql rustfs redis
cd gallery-monorepo
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev:api        # http://localhost:3000
pnpm dev:web        # http://localhost:3001
pnpm dev:admin      # http://localhost:3002
```

演示账号密码均为 `123456`：`admin@sylvie.cc`（管理员，后台也可输入简写 `admin`）、`demo@sylvie.cc`（注册会员）、`vip@sylvie.cc`（付费会员）。开发验证码固定为 `123456`。

API 启动后可访问 `http://localhost:3000/api/docs` 查看接口文档，OpenAPI JSON 位于 `/api/openapi.json`。接口定义以 `createRoute` 声明为准，新增/调整接口时同步更新路由声明、validators 与响应模型。

## 跨文档业务规则

- **角色**：`guest`（游客，不落库）/ `member`（注册会员）/ `vip`（付费会员）/ `admin`（管理员）。仅 `admin` 可发布图集，注册会员与付费会员均无上传 / 发布权限。
- **图集访问**：游客与注册会员未解锁时只能看前 3 张。注册会员消耗 `album.points` 永久解锁单套图集，解锁后可查看全部并重复下载。付费会员全站查看与下载，不消耗积分。
- **积分**：界面统一称「解锁积分」。通过每日签到获得（`sys_config.checkin.points`，默认 2 分），仅在解锁图集时消耗，下载不扣分；`user.points` 不得为负。
- **水印**：仅未解锁时的前 3 张预览使用 `album_image.watermark_url`；解锁后及付费会员一律返回原图 `url`。全局开关 `sys_config.image.watermark_on` 只控制未解锁预览。
- **发布**：`album.status` 为 `draft` / `published` / `offline`；`published_at` 是最新排序依据；`is_recommended` 进入瀑布流推荐池。
- **支付**：v1 仅支持支付宝；后台赠送会员走 `pay_type='admin'` 的 0 元订单；续费在剩余 `user.vip_expire_at` 上叠加 30 天。本地开发默认 `ALIPAY_MOCK=true` 模拟支付。
- **软删除**：优先使用 `is_deleted` / `status`，不做物理删除。冗余计数（`album.view_count` / `fav_count` / `download_count` / `comment_count`、`author.album_count`、`tag.use_count`）必须与底层数据变更在同一操作中维护。

## 数据库约定

MySQL 8 / InnoDB / `utf8mb4_unicode_ci`；主键统一 `BIGINT UNSIGNED AUTO_INCREMENT`；时间统一 `DATETIME`（应用层存北京时间）；优先软删除；列表页依赖的计数做冗余。修改前先阅读 SQL 文件头部约定。演示数据仅用于本地开发，修改种子结构时重新运行 `node scripts/generate-demo-data.mjs`。

## 实现约定

- API 统一返回 `{ code, message, data }`，成功时 `code=200`；分页统一 `{ list, total, page, pageSize, totalPages }`。
- 共享类型以 `packages/types` 为准，修改接口时同步更新 Web 调用与 DTO。
- 前台登录态存 `localStorage`（`sylvie_token`），请求通过 `Authorization: Bearer` 传递；不要假设存在 Cookie 会话。
- 后台独立登录态存 `sylvie_admin_token`（勾选「记住我」用 localStorage，否则 sessionStorage），由 Zustand `useAuthStore` 统一管理读写；所有后台接口位于 `/api/admin/*`，由 `authenticate + requireAdmin` 保护。后台服务端数据（列表、详情、看板）统一用 SWR，写操作后通过 `revalidateAll()` / `mutate()` 刷新。
- 后台所有写操作必须调用 `logAdminOp` 写入 `admin_op_log`；标签收录数、作者图集数、评论数等冗余字段需在同一事务或操作后重算。
- API 数据库访问使用参数化 SQL，语句统一放在 `apps/api/src/sql/*.sql.ts` 并以 `{ sql, params }` 返回；列表计数与冗余字段需事务内同步。Drizzle schema 仅作为表结构的类型化映射（`db.db` 查询构建器），服务层仍以参数化 SQL 为主。
- OpenAPI 文档由 `createRoute` 的路由声明自动生成（`@hono/zod-openapi`），不要再手写 spec 文件。新增接口时在 `routes/` 声明请求与响应模型（`validators/` 放请求 schema，`openapi/models/` 放响应模型），handler 放 `controllers/`。
- 日志统一使用 `@sylvie/logger`：API 侧从 `apps/api/src/utils/logger.ts` 取实例，按模块用 `moduleLogger('模块名')` 派生；不要直接使用 `console.*`（`config/env.ts` 在日志初始化前的校验失败除外）。
- 对象存储统一使用 `@sylvie/storage`：API 侧实例在 `apps/api/src/services/storage.service.ts`，配置从 env 注入；不要再直接使用 `@aws-sdk/client-s3`。图片压缩/水印等业务处理仍留在 API。
- 可复用组件放 `@sylvie/ui`：无样式逻辑放根入口，前台视觉组件放 `@sylvie/ui/web`，后台放 `@sylvie/ui/admin`；依赖应用状态（auth、SWR、路由、后台日期工具）的组件留在应用内。两个应用都需在 CSS 中用 `@source` 声明对应子目录，Tailwind 才会生成组件类名。
- Agent / MCP 接入使用独立 `agent_token`，不要复用登录 JWT：令牌分 `read` / `write` scope、可设有效期并支持吊销，明文只在创建时返回一次。MCP 端点 `/api/mcp` 由 `authenticateMcp + requireAdmin` 保护，写工具需同时满足 `MCP_ALLOW_WRITE=true` 与令牌 `scope=write`。
- 缓存与限流统一使用 `@sylvie/cache`：API 实例在 `apps/api/src/cache/index.ts`，缓存键用 `cacheKey('域', ...)` 分段；只缓存访客可复用数据（登录用户带收藏 / 订阅状态，除 `site:bootstrap` 外不缓存），管理端写操作后调用 `invalidateCache('域', ...)`。限流规则集中在 `apps/api/src/middleware/rate-limit.ts`，登录、验证码、注册、评论、解锁、下载等敏感接口必须限流；缓存不可用时按放行降级。
- 原型仅作视觉与交互参考，实际页面以 Web/Admin 实现为准；三者视觉语言一致：深色背景、玫红 `#ff2d55`、渐变「希」字 Logo。

## Git 工作流

直接在 `main` 分支提交，不新建功能分支。提交信息使用中文；文档变更以 `docs:` 开头，代码变更使用 `feat:` / `fix:` / `chore:` 前缀。大型任务按阶段模块提交，不要等全部完成后再一次性提交。
