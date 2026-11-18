# 希尔薇图集 · v1（Web + API）

基于 `docs/` 下的原型与数据库设计实现的 v1 前台与接口。管理后台为独立应用，后续单独实现。

## 技术栈

| 模块 | 目录 | 技术 |
|---|---|---|
| Web | `apps/web` | Next.js 15（App Router）+ React 19 + Tailwind CSS v4 + SWR |
| API | `apps/api` | Hono + MySQL 8 + RustFS（S3 兼容） |
| 共享类型 | `packages/types` | API DTO、枚举常量 |
| 共享工具 | `packages/utils` | 日期 / 计数 / 价格 / 文本格式化 |
| 数据库客户端 | `packages/db` | mysql2 连接池与参数化查询 |
| 工程配置 | `packages/tsconfig`、`packages/eslint-config` | TypeScript / ESLint 基线 |

## 本地启动

### 1. 启动 MySQL 与 RustFS

```bash
# 仓库根目录
docker compose -f scripts/docker-compose.yml up -d

# 首次启动会自动执行建表与演示数据（24 张表、37 套图集、1140 条媒体）
docker compose -f scripts/docker-compose.yml ps
```

### 2. 安装依赖并配置环境变量

```bash
cd gallery-monorepo
pnpm install

cp apps/api/.env.example apps/api/.env
```

### 3. 启动 API 与 Web

```bash
# 分别在两个终端执行
pnpm dev:api   # http://localhost:3000
pnpm dev:web   # http://localhost:3001

# 或同时启动
pnpm dev
```

访问 http://localhost:3001 。Web 通过 Next rewrites 将 `/api` 代理到 API（默认 `http://127.0.0.1:3000`）。

## 演示账号

密码均为 `123456`：

| 邮箱 | 角色 | 说明 |
|---|---|---|
| `admin@sylvie.cc` | 管理员 | 前台可见后台入口（后台待建设） |
| `demo@sylvie.cc` | 注册会员 | 8 积分、5 条收藏、2 位订阅、1 套已解锁 |
| `vip@sylvie.cc` | 付费会员 | 有效期至 2027-06-01 |

注册验证码在开发环境固定为 `123456`（`VERIFY_CODE_DEMO`）。

## 已实现功能

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

## 重要约定

- 未解锁（游客 / 注册会员）只返回前 3 张图片；`image.watermark_on=1` 时取 `watermark_url`。
- 积分解锁与付费会员返回原图；下载不扣积分。
- 评论一级与回复均先审后发；本人可见待审核内容并显示状态。
- 付费会员续费在剩余有效期上叠加；管理员赠送会员（`pay_type='admin'`）留给后台。
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
- Web 构建时的 `API_BASE_URL` 决定 `/api` 反向代理目标（容器内通常为 `http://api:3000`）。

## 待实现

- 独立管理后台（发布图集、标签 / 公告 / 评论审核、会员套餐、支付流水、配置与日志）。
- 真实支付宝支付与退款回调。
- SMTP 邮件发送。
