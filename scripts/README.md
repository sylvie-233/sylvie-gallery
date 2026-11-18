# 基础服务（MySQL + RustFS）

| 服务 | 端口 | 账号 / 密钥 | 说明 |
|---|---|---|---|
| MySQL 8.0 | `3306` | 用户 `sylvie` / `123456`，库 `sylvie_gallery` | 首次启动自动执行建表与演示数据 |
| RustFS | `9000` | `rustfsadmin` / `rustfsadmin` | S3 兼容对象存储，桶 `sylvie` 由 API 启动时自动创建 |
| RustFS 控制台 | `9001` | 同上 | 浏览器打开 http://localhost:9001 |

## 使用

```bash
# 可选：复制环境变量文件并按需修改
cp scripts/.env.example scripts/.env

# 启动
docker compose -f scripts/docker-compose.yml up -d

# 查看健康状态
docker compose -f scripts/docker-compose.yml ps

# 停止（保留数据）
docker compose -f scripts/docker-compose.yml down

# 重置（清空 MySQL 与 RustFS 数据，下次启动重新初始化）
docker compose -f scripts/docker-compose.yml down -v
```

## 初始化 SQL

MySQL 数据卷为空时，容器会按文件名顺序执行：

1. `../docs/美女写真网站-v1数据库设计.sql`：表结构 + 基础种子（套餐、管理员、作者、标签、配置、字典）。
2. `./init/02-demo-data.sql`：演示用户、37 套图集、图片/视频、公告、评论、收藏、订阅、通知。

演示账号（密码均为 `123456`）：

| 邮箱 | 角色 | 说明 |
|---|---|---|
| `admin@sylvie.cc` | 管理员 | 前台可看到后台入口 |
| `demo@sylvie.cc` | 注册会员 | 有积分、收藏、订阅、解锁记录 |
| `vip@sylvie.cc` | 付费会员 | 到期时间 2027-06-01 |

如需重新生成演示数据 SQL，先安装 monorepo 依赖，然后在仓库根目录执行：

```bash
node scripts/generate-demo-data.mjs
```

脚本会使用 `apps/api/node_modules/bcryptjs` 生成密码哈希，并覆盖 `scripts/init/02-demo-data.sql`。
