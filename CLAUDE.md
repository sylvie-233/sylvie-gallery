# CLAUDE.md

本文件为 Claude Code 在此代码库中工作时提供指导。

## 仓库定位

本仓库包含「希尔薇图集」v1 的设计文档与实现代码：`docs/` 为规格与原型，`scripts/` 为本地基础服务编排，`gallery-monorepo/` 为 pnpm + Turbo 工作区（前台 Web、独立管理后台 Admin、API）。管理后台与前台独立部署、独立登录，仅共用数据库。

## 文档职责对照

| 文件 | 职责 |
|---|---|
| `docs/美女写真网站-v1功能清单.md` | 前台功能与交互规格，按页面组织。文首 YAML frontmatter 用于 markmap 思维导图视图。 |
| `docs/美女写真网站-v1原型设计.html` | 前台交互原型：单文件自包含 HTML（内联 CSS/JS、演示数据，状态存 `localStorage`），浏览器直接打开即可。 |
| `docs/美女写真网站-v1数据库设计.sql` | MySQL 8 数据库设计：24 张表，文首为设计约定，文末为种子数据。 |
| `docs/美女写真网站-v1管理后台功能清单.md` | 管理后台规格。后台为独立应用，仅面向桌面端（≥1280px），与前台只共用数据库。 |
| `docs/美女写真网站-v1管理后台原型.html` | 管理后台原型，同样是单文件；登录层与前台独立。 |

跨文件保持一致是主要维护工作：修改规则或字段时，需同步更新 SQL（表结构、注释、种子数据）、对应功能清单，以及行为可见的两个原型。

## 代码结构

| 路径 | 职责 |
|---|---|
| `scripts/docker-compose.yml` | MySQL 8 + RustFS + API + Web + Admin 编排；首次启动执行建表与演示数据。 |
| `manage.ps1` | 根目录运维脚本：up/down/restart/reset/build/logs/cli/status/init/pull/dev。 |
| `scripts/init/02-demo-data.sql` | 演示数据（37 套图集 / 1140 条媒体 / 公告 / 评论 / 收藏 / 订单），由 `scripts/generate-demo-data.mjs` 生成。 |
| `gallery-monorepo/apps/web` | Next.js 15 App Router 前台，Tailwind CSS v4 + SWR；通过 rewrites 代理 `/api`。 |
| `gallery-monorepo/apps/admin` | React + Vite + React Router 管理后台，Tailwind CSS v4 + SWR；开发端口 3002。 |
| `gallery-monorepo/apps/api` | Hono API：JWT、MySQL 参数化查询、RustFS 对象存储、Sharp 图片处理、ZIP 下载。 |
| `gallery-monorepo/packages/types` | API 响应、DTO、枚举常量；Web 与 API 共用。 |
| `gallery-monorepo/packages/db` | mysql2 连接池、事务与参数化查询封装。 |
| `gallery-monorepo/packages/utils` | 日期、计数、价格、文本格式化等纯函数。 |

## 本地开发

前置：Node.js ≥ 20、pnpm ≥ 9、Docker。

```bash
# 容器化一键启动（含三端）：前台 8080、后台 8081、API 3000
pwsh ./manage.ps1 up

# 或本地热更新：仅容器跑 MySQL + RustFS，再启动三个 pnpm 服务
docker compose -f scripts/docker-compose.yml up -d mysql rustfs
cd gallery-monorepo
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev:api        # http://localhost:3000
pnpm dev:web        # http://localhost:3001
pnpm dev:admin      # http://localhost:3002
```

演示账号密码均为 `123456`：`admin@sylvie.cc`（管理员，后台也可输入简写 `admin`）、`demo@sylvie.cc`（注册会员）、`vip@sylvie.cc`（付费会员）。开发验证码固定为 `123456`。

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
- 后台独立登录态存 `sylvie_admin_token`（勾选「记住我」用 localStorage，否则 sessionStorage）；所有后台接口位于 `/api/admin/*`，由 `authenticate + requireAdmin` 保护。
- 后台所有写操作必须调用 `logAdminOp` 写入 `admin_op_log`；标签收录数、作者图集数、评论数等冗余字段需在同一事务或操作后重算。
- API 数据库访问使用参数化 SQL；列表计数与冗余字段需事务内同步。
- 原型仅作视觉与交互参考，实际页面以 Web/Admin 实现为准；三者视觉语言一致：深色背景、玫红 `#ff2d55`、渐变「希」字 Logo。

## Git 工作流

直接在 `main` 分支提交，不新建功能分支。提交信息使用中文；文档变更以 `docs:` 开头，代码变更使用 `feat:` / `fix:` / `chore:` 前缀。大型任务按阶段模块提交，不要等全部完成后再一次性提交。
