# 希尔薇图集 · v1（Web + API + Admin）

基于 `docs/` 下的原型与数据库设计实现的 v1 前台、接口与独立管理后台。

## 技术栈

| 模块 | 目录 | 技术 |
|---|---|---|
| Web | `apps/web` | Next.js 15（App Router）+ React 19 + Tailwind CSS v4 + SWR |
| Admin | `apps/admin` | React 19 + Vite + React Router + Tailwind CSS v4 + SWR + Zustand |
| API | `apps/api` | Hono + MySQL 8 + Redis 7.4 + RabbitMQ 4.4 + RustFS（S3 兼容）+ Sharp + SMTP（Mailpit）+ 支付宝 |
| 共享类型 | `packages/types` | API DTO、管理端 DTO、枚举常量 |
| 共享工具 | `packages/utils` | 日期 / 计数 / 价格 / 文本格式化 |
| 共享 UI | `packages/ui` | 无样式工具 + Web / Admin 两套视觉组件 |
| 共享缓存 | `packages/cache` | 内存 / Redis 双后端、防击穿、固定窗口限流 |
| 共享任务 | `packages/job` | BullMQ 定时任务 / 延时任务封装 |
| 共享通知 | `packages/notify` | 邮件 / 短信通道封装，短信实现由调用方注入 |
| 共享消息队列 | `packages/mq` | RabbitMQ 持久化队列、confirm 发布、自动重连 |
| 共享支付 | `packages/payment` | 支付宝网页支付、查询与异步通知验签 |
| 共享日志 | `packages/logger` | pino 封装、脱敏、子日志 |
| 共享存储 | `packages/storage` | S3 / RustFS 对象存储封装 |
| 数据库客户端 | `packages/db` | Drizzle schema、mysql2 连接池与参数化查询 |
| 工程配置 | `packages/tsconfig`、`packages/eslint-config` | TypeScript / ESLint 基线 |

## 一键容器化（推荐验收）

在仓库根目录执行（PowerShell 7+）：

```powershell
pwsh ./manage.ps1 up          # 构建并启动 MySQL / Redis / RustFS / API / Web / Admin
pwsh ./manage.ps1 status      # 查看状态与访问地址
pwsh ./manage.ps1 dev         # 只容器跑基础服务，本机热更新三端
pwsh ./manage.ps1 reset -Force
```

容器化地址：前台 http://localhost:8080、后台 http://localhost:8081、API http://localhost:3000、RustFS 控制台 http://localhost:9001、Redis localhost:6379、Mailpit 邮件箱 http://localhost:8025（SMTP 1025）。详见 `scripts/README.md`。

## 本地开发（热更新）

### 1. 启动 MySQL、Redis、Mailpit 与 RustFS

```bash
# 仓库根目录
docker compose -f scripts/docker-compose.yml up -d

# 首次启动会自动执行建表与演示数据
# 25 张表、40 套图集（37 已发布 / 1 草稿 / 2 已下架）、1176 条媒体
docker compose -f scripts/docker-compose.yml ps
```

### 2. 安装依赖并配置环境变量

```bash
cd gallery-monorepo
pnpm install

cp apps/api/.env.example apps/api/.env
# 可选
cp apps/admin/.env.example apps/admin/.env
```

### 3. 启动 API、前台与后台

```bash
# 分别执行
pnpm dev:api     # http://localhost:3000
pnpm dev:web     # http://localhost:3001
pnpm dev:admin   # http://localhost:3002

# 或同时启动
pnpm dev
```

- 前台：http://localhost:3001 （Next rewrites 将 `/api` 代理到 API）
- 后台：http://localhost:3002 （Vite 将 `/api` 代理到 API）
- 后台为独立应用与独立登录，只与前台共用数据库。

## 演示账号

密码均为 `123456`：

| 邮箱 | 角色 | 说明 |
|---|---|---|
| `admin@sylvie.cc` | 管理员 | 后台登录；也支持后台输入简写 `admin` |
| `demo@sylvie.cc` | 注册会员 | 8 积分、5 条收藏、2 位订阅、1 套已解锁 |
| `vip@sylvie.cc` | 付费会员 | 有效期至 2027-06-01 |

注册验证码在开发环境固定为 `123456`（`VERIFY_CODE_DEMO`）。

## 前台已实现

- 首页：最近更新、个人写真作者卡、公告、站点统计
- 图集：最新 / 热门 / 收藏排序、标签与关键词筛选、24 套/页
- 作者：列表搜索、作者主页、订阅 / 取消订阅
- 瀑布流：推荐池 + 浏览偏好加权、24 首屏 / 12 增量、无限滚动
- 标签云：按收录数 5 档字号，仅展示有收录的标签
- 公告：列表、搜索、置顶、详情弹层
- 会员：注册会员 / 付费会员双卡、支付宝订单（本地模拟支付）、续费叠加
- 图集详情：前 3 张水印预览、积分解锁、会员畅看、评论先审后发、订阅、收藏、ZIP 整包下载
- 个人中心：资料与头像编辑（RustFS 上传）、每日签到、收藏预览、已订阅作者
- 我的通知：全部 / 未读、详情弹层、关联图集跳转、全部已读
- 我的收藏 / 我的购买：分页、会员订单续费、积分解锁记录

## 管理后台已实现

- 独立登录：仅 `role='admin'` 可进入；记住我（localStorage / sessionStorage）；无注册入口
- 数据看板：今日营收 / 积分解锁 / 新增用户 / PV·UV、站点规模、营收趋势（7 天 / 30 天 / 6 个月）、待办、最近发布、热搜词、快捷操作
- 图集管理：状态筛选、搜索、分页；发布 / 下架、推荐池切换、删除、编辑
- 图集编辑器：新建 / 编辑共用整页；图片 / 视频上传（RustFS）、拖拽排序、封面指定、示例图、灯箱预览、标签搜索、草稿保存 / 发布
- 标签管理：新建 / 重命名 / 隐藏 / 删除（仅未收录）；`tag.use_count` 同步
- 作者管理：新建 / 编辑 / 隐藏 / 删除；头像上传、排序权重、风格标签
- 评论审核：待审 / 已通过 / 已拒绝，时间筛选、搜索、通过 / 拒绝 / 删除、通知用户
- 公告管理：类型 / 状态 / 时间筛选、置顶、新建 / 编辑 / 发布 / 下线 / 删除
- 支付流水：营收统计、业务 / 状态 / 时间筛选、退款、按筛选结果导出 UTF-8 BOM CSV
- 用户管理：角色 / 状态筛选、积分调整、赠送 30 天会员、重置密码、封禁 / 解封
- 友链与配置：版权 / 备案 / 年龄声明 / 免责声明 / 签到积分 / 水印开关、会员套餐、友链增删
- 操作日志：动作分组筛选、时间 / 关键词搜索、详情弹窗；所有写操作自动留痕

## 重要约定

- 未解锁（游客 / 注册会员）只返回前 3 张图片；`image.watermark_on=1` 时取 `watermark_url`。
- 后台图片上传由 Sharp 生成缩略图与水印版原图；原始文件、缩略图、水印图分别存放在 RustFS。
- 积分解锁与付费会员返回原图；下载不扣积分。
- 评论一级与回复均先审后发；本人可见待审核内容并显示状态。
- 付费会员续费在剩余有效期上叠加；管理员赠送会员生成 `pay_type='admin'` 的 0 元订单。
- 后台所有写操作写入 `admin_op_log`；标签收录数、作者图集数、评论数、收藏数等冗余字段随操作同步。
- 线上支付：v1 默认 `ALIPAY_MOCK=true` 走本地模拟支付；接入真实支付宝需配置商户参数与回调地址。
- 邮件验证码：当前仅写服务端日志并返回开发演示码；接入 SMTP 后可替换 `auth.service.ts` 的发送实现。

## 常用命令

```bash
pnpm build       # 构建全部工作区
pnpm typecheck   # TypeScript 检查
pnpm lint        # ESLint
pnpm clean       # 清理产物
```

## 生产构建

- API：`pnpm --filter @sylvie/api build`，运行 `node apps/api/dist/main.js`；Dockerfile 见 `apps/api/Dockerfile`。
- Web：`pnpm --filter @sylvie/web build`，运行 `pnpm --filter @sylvie/web start`；容器构建设置 `NEXT_STANDALONE=1`，Dockerfile 见 `apps/web/Dockerfile`。
- Admin：`pnpm --filter @sylvie/admin build`，产物在 `apps/admin/dist`；Dockerfile + Nginx SPA 配置见 `apps/admin/Dockerfile`、`apps/admin/nginx.conf`。
- Web 构建时的 `API_BASE_URL`、Admin 构建时的 `VITE_WEB_URL` 需按部署环境填写。

## 当前限制

- 真实支付宝支付与退款回调未接入。
- SMTP 邮件发送未接入，验证码取开发演示码。
- 重置密码后的「下次登录强制修改」尚未落库实现（数据库无对应字段）。
- 视频上传保存但暂无服务端转码 / 封面截帧，编辑器仅展示文件名与体积。
- 管理后台按 ≥1280px 桌面布局设计，不做移动端适配。
- Admin 的 Vite 构建通过根 `package.json` 的 pnpm override 使用 `@rollup/wasm-node`，规避 Alpine/musl 下 Rollup 原生解析器对 React DOM 的嵌套限制。
