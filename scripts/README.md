# 本地 / 单机编排（MySQL + Redis + RustFS + API + Web + Admin）

| 服务 | 容器 | 默认端口 | 说明 |
|---|---|---|---|
| MySQL 8.0 | `sylvie-mysql` | `3306` | 用户 `sylvie` / `123456`，库 `sylvie_gallery` |
| Redis 7.4 | `sylvie-redis` | `6379` | API 缓存与限流；AOF 持久化，最大内存 256MB（allkeys-lru） |
| RustFS | `sylvie-rustfs` | `9000` | S3 兼容对象存储，桶 `sylvie` 由 API 启动时自动创建 |
| RustFS 控制台 | — | `9001` | 浏览器打开 http://localhost:9001 |
| API | `sylvie-api` | `3000` → 容器 3000 | Hono，健康检查 `/health` |
| Web | `sylvie-web` | `8080` → 容器 3001 | Next.js standalone |
| Admin | `sylvie-admin` | `8081` → 容器 80 | React SPA + Nginx |

## 使用

推荐在仓库根目录使用运维脚本（PowerShell 7+）：

```powershell
pwsh ./manage.ps1 up                  # 构建并启动全部服务
pwsh ./manage.ps1 up -Target mysql    # 只启动 MySQL
pwsh ./manage.ps1 up -Target redis    # 只启动 Redis
pwsh ./manage.ps1 up -Target admin    # 只启动 Admin（自动带起依赖）
pwsh ./manage.ps1 status              # 状态与访问地址
pwsh ./manage.ps1 logs -Target api -Follow
pwsh ./manage.ps1 build -Target api   # 只重建 API 镜像
pwsh ./manage.ps1 cli                 # 进入 MySQL 客户端
pwsh ./manage.ps1 init                # 删除业务库并重跑建表 + 演示数据
pwsh ./manage.ps1 reset -Force        # 清空数据卷并重建全部服务
pwsh ./manage.ps1 dev                 # 仅容器跑 MySQL/Redis/RustFS，本机 pnpm dev 热更新
```

> 应用镜像使用 `node:24-alpine`（API / Web / Admin 构建）与 `nginx:1.29`（Admin 运行）。
> BuildKit 会向 Docker Hub 解析同名 tag 的最新摘要，因此本地已有同名镜像也可能重新下载；
> 网络较慢时可先 `docker pull node:24-alpine nginx:1.29`，或临时使用
> `DOCKER_BUILDKIT=0 docker compose ... build` 复用本地镜像。

也可以直接使用 docker compose：

```bash
# 可选：复制环境变量文件并按需修改
cp scripts/.env.example scripts/.env

# 启动全部
docker compose -f scripts/docker-compose.yml up -d --build

# 仅基础服务
docker compose -f scripts/docker-compose.yml up -d mysql rustfs

# 停止（保留数据）
docker compose -f scripts/docker-compose.yml down

# 重置（清空 MySQL、Redis 与 RustFS 数据，下次启动重新初始化）
docker compose -f scripts/docker-compose.yml down -v
```

## 初始化 SQL

MySQL 数据卷为空时，容器会按文件名顺序执行：

1. `../docs/美女写真网站-v1数据库设计.sql`：表结构 + 基础种子（套餐、管理员、作者、标签、配置、字典）。
2. `./init/02-demo-data.sql`：演示用户、40 套图集（37 已发布 / 1 草稿 / 2 下架）、1176 条媒体、公告、评论、收藏、订阅、订单、通知、搜索与浏览记录。

演示账号（密码均为 `123456`）：

| 邮箱 | 角色 | 说明 |
|---|---|---|
| `admin@sylvie.cc` | 管理员 | 后台也支持输入简写 `admin` |
| `demo@sylvie.cc` | 注册会员 | 8 积分、收藏、订阅、解锁记录 |
| `vip@sylvie.cc` | 付费会员 | 到期时间 2027-06-01 |

如需重新生成演示数据 SQL，先安装 monorepo 依赖，然后在仓库根目录执行：

```bash
node scripts/generate-demo-data.mjs
```

脚本会使用 `apps/api/node_modules/bcryptjs` 生成密码哈希，并覆盖 `scripts/init/02-demo-data.sql`。

## 环境变量

`scripts/.env.example` 包含 MySQL、Redis、RustFS、JWT、CORS、Web/Admin 端口与构建地址。生产部署前至少替换：

- `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD`
- `JWT_SECRET`（≥ 32 位随机字符串）
- `S3_ACCESS_KEY` / `S3_SECRET_KEY`
- `WEB_PUBLIC_URL`（后台跳转前台的公网地址）
