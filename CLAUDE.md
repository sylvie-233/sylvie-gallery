# CLAUDE.md

本文件为 Claude Code 在此代码库中工作时提供指导。

## 仓库定位

本仓库仅为「希尔薇图集」v1 的设计 / 文档仓库，不含应用源码、包管理清单、构建、代码检查或测试工具。不要臆造 npm、构建或测试命令。所有交付物位于 `docs/`，使用中文编写，文件名保持 `美女写真网站-v1` 前缀。

## 文档职责对照

| 文件 | 职责 |
|---|---|
| `docs/美女写真网站-v1功能清单.md` | 前台功能与交互规格，按页面组织。文首 YAML frontmatter 用于 markmap 思维导图视图。 |
| `docs/美女写真网站-v1原型设计.html` | 前台交互原型：单文件自包含 HTML（内联 CSS/JS、演示数据，状态存 `localStorage`），浏览器直接打开即可。 |
| `docs/美女写真网站-v1数据库设计.sql` | MySQL 8 数据库设计：24 张表，文首为设计约定，文末为种子数据。 |
| `docs/美女写真网站-v1管理后台功能清单.md` | 管理后台规格。后台为独立应用，仅面向桌面端（≥1280px），与前台只共用数据库。 |
| `docs/美女写真网站-v1管理后台原型.html` | 管理后台原型，同样是单文件；登录层与前台独立。 |

跨文件保持一致是主要维护工作：修改规则或字段时，需同步更新 SQL（表结构、注释、种子数据）、对应功能清单，以及行为可见的两个原型。

## 跨文档业务规则

- **角色**：`guest`（游客，不落库）/ `member`（注册会员）/ `vip`（付费会员）/ `admin`（管理员）。仅 `admin` 可发布图集，注册会员与付费会员均无上传 / 发布权限。
- **图集访问**：游客与注册会员未解锁时只能看前 3 张。注册会员消耗 `album.points` 永久解锁单套图集，解锁后可查看全部并重复下载。付费会员全站查看与下载，不消耗积分。
- **积分**：界面统一称「解锁积分」。通过每日签到获得（`sys_config.checkin.points`，默认 2 分），仅在解锁图集时消耗，下载不扣分；`user.points` 不得为负。
- **水印**：仅未解锁时的前 3 张预览使用 `album_image.watermark_url`；解锁后及付费会员一律返回原图 `url`。全局开关 `sys_config.image.watermark_on` 只控制未解锁预览。
- **发布**：`album.status` 为 `draft` / `published` / `offline`；`published_at` 是最新排序依据；`is_recommended` 进入瀑布流推荐池。
- **支付**：v1 仅支持支付宝；后台赠送会员走 `pay_type='admin'` 的 0 元订单；续费在剩余 `user.vip_expire_at` 上叠加 30 天。
- **软删除**：优先使用 `is_deleted` / `status`，不做物理删除。冗余计数（`album.view_count` / `fav_count` / `download_count` / `comment_count`、`author.album_count`、`tag.use_count`）必须与底层数据变更在同一操作中维护。

## 数据库约定

MySQL 8 / InnoDB / `utf8mb4_unicode_ci`；主键统一 `BIGINT UNSIGNED AUTO_INCREMENT`；时间统一 `DATETIME`（应用层存北京时间）；优先软删除；列表页依赖的计数做冗余。修改前先阅读 SQL 文件头部约定。

## 原型约定

- 两个原型均为独立 HTML：浏览器直接打开，无安装 / 构建 / 监听步骤。
- 原型状态由硬编码演示数据 + `localStorage` 组成，不会持久化到后端。
- 前台原型适配 PC / H5；后台原型仅面向桌面端。
- 统一视觉语言：深色背景、玫红强调色 `#ff2d55`、渐变方块「希」字 Logo。

## Git 工作流

直接在 `main` 分支提交，不新建功能分支。提交信息使用中文，并以 `docs:` 前缀开头。
