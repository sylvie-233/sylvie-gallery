-- =====================================================================
-- 希尔薇图集 · v1 数据库设计（MySQL 8.x）
-- 文件：美女写真网站-v1数据库设计.sql
-- 对应原型：docs/美女写真网站-v1原型设计.html（前台）
--           docs/美女写真网站-v1管理后台原型.html（管理后台）
-- 对应清单：docs/美女写真网站-v1功能清单.md
--           docs/美女写真网站-v1管理后台功能清单.md
--
-- 设计约定：
--   1) 引擎 InnoDB，字符集 utf8mb4（表情/生僻字安全），排序 utf8mb4_unicode_ci
--   2) 主键统一 bigint unsigned auto_increment；时间统一 datetime（应用层存北京时间）
--   3) 软删除优先：is_deleted / status，不物理删数据
--   4) 计数冗余（收藏数/评论数/浏览量）存主表，异步或事务内累加，列表页免聚合
--   5) 角色即权限：guest=游客(不落库) member=注册会员 vip=付费会员 admin=管理员(唯一可发布)
--   6) 支付渠道 v1 仅支付宝；管理员赠送会员走 pay_type='admin' 的 0 元单留痕
--
-- 表清单（24 张）：
--   user              用户                  → 注册/登录/个人中心/头像昵称编辑
--   user_checkin      每日签到              → 签到领积分（每日 +2，sys_config 可配）
--   author            作者                  → 首页个人写真/作者列表/作者主页（后台可隐藏/排序）
--   album             图集                  → 首页/图集页/瀑布流/详情页（含推荐池标记）
--   album_image       图集图片/视频         → 详情页媒体、前 3 张预览规则、未解锁水印取图
--   tag               标签                  → 标签云（#前缀 + 收录数）；后台标签管理可新建/改名/隐藏
--   album_tag         图集-标签关联         → 图集页标签筛选/标签结果页
--   announcement      公告                  → 公告列表/搜索/详情弹层
--   user_notification 用户通知              → 我的通知（更新类型可跳图集）
--   favorite          收藏                  → 我的收藏/卡片收藏数
--   subscription      作者订阅              → 已订阅作者/订阅按钮
--   pay_order         支付订单              → 会员开通/续费、积分解锁（含退款留痕）
--   album_unlock      图集解锁记录          → 未解锁只看前 3 张的判定依据
--   comment           评论/回复             → 详情页评论区（先审后发；后台可删已通过评论）
--   membership_plan   会员套餐              → ¥19/月 配置化（后台可改价与权益文案）
--   friend_link       友情链接              → 页脚友链胶囊
--   sys_dict_type     系统字典类型          → 字典分组管理（后台维护）
--   sys_dict_data     系统字典项            → 枚举值/文案/样式的配置化来源
--   sys_config        站点配置              → 版权/备案/水印/签到积分/站点文案
--   user_view_log     浏览记录              → PV/UV、瀑布流个人推荐依据
--   download_log      下载记录              → 下载统计与防滥用
--   search_log        搜索日志              → 搜索词热度统计（后台看板热搜词 TOP N）
--   verify_code       验证码                → 邮箱验证（注册/找回密码）
--   admin_op_log      管理操作日志          → 发布/上下架/推荐/标签/评论审核/积分调整/赠送会员等留痕
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `sylvie_gallery`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `sylvie_gallery`;

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. 用户表
--    覆盖：邮箱注册/登录、角色（注册会员/付费会员/管理员）、头像（预设序号或上传 URL）、
--          昵称编辑、积分余额、付费会员有效期（续费在剩余天数上叠加）
-- ---------------------------------------------------------------------
CREATE TABLE `user` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `email`         VARCHAR(128)    NOT NULL                COMMENT '邮箱（登录账号，唯一）',
  `password_hash` VARCHAR(128)    NOT NULL                COMMENT '密码哈希（bcrypt/argon2，加盐）',
  `nickname`      VARCHAR(16)     NOT NULL                COMMENT '昵称（1-16 字符）',
  `avatar_type`   TINYINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '头像类型 0=预设色卡 1=自定义上传',
  `avatar_index`  TINYINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '预设色卡序号（0-7）',
  `avatar_url`    VARCHAR(255)    NULL                    COMMENT '自定义头像 URL（对象存储，≤2MB 原图服务端压 256×256）',
  `role`          ENUM('member','vip','admin') NOT NULL DEFAULT 'member' COMMENT '角色：注册会员/付费会员/管理员',
  `points`        INT UNSIGNED    NOT NULL DEFAULT 0      COMMENT '解锁积分余额（签到获取，解锁消耗）',
  `vip_expire_at` DATETIME        NULL                    COMMENT '付费会员到期时间（NULL=非会员；续费= max(当前,到期)+30天）',
  `status`        TINYINT UNSIGNED NOT NULL DEFAULT 1    COMMENT '状态 1=正常 0=封禁',
  `email_verified`TINYINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '邮箱是否已验证',
  `is_deleted`    TINYINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '软删除',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_email` (`email`),
  KEY `idx_role_status` (`role`, `status`)
) ENGINE=InnoDB COMMENT='用户';

-- ---------------------------------------------------------------------
-- 2. 每日签到表
--    覆盖：注册会员每日签到领积分（每日一次，每次 +2 积分）
-- ---------------------------------------------------------------------
CREATE TABLE `user_checkin` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `points`     SMALLINT UNSIGNED NOT NULL DEFAULT 2 COMMENT '本次获得积分',
  `checkin_date` DATE NOT NULL             COMMENT '签到日期（同日唯一）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_date` (`user_id`, `checkin_date`),
  KEY `idx_date` (`checkin_date`)
) ENGINE=InnoDB COMMENT='每日签到';

-- ---------------------------------------------------------------------
-- 3. 作者表
--    覆盖：首页「个人写真」作者卡（方形封面+图集数徽章）、作者列表页（搜索姓名/别名/风格）、
--          作者主页介绍卡（别名/简介/最近更新）
--    注：author_count（收录套数）可由 album 表实时 COUNT，或定期冗余同步
--        作者均由系统管理员维护（非作者自行注册入驻），故不设入驻日期字段，创建时间即记录时间
-- ---------------------------------------------------------------------
CREATE TABLE `author` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '作者ID',
  `name`           VARCHAR(32)     NOT NULL                COMMENT '作者名（如 铃木美咲）',
  `alias`          VARCHAR(64)     NULL                    COMMENT '别名（多个逗号分隔，用于搜索）',
  `initial`        VARCHAR(8)      NOT NULL DEFAULT ''     COMMENT '头像首字（渐变底色卡上展示）',
  `avatar_url`     VARCHAR(255)    NULL                    COMMENT '作者头像 URL（空则用渐变色卡）',
  `cover_url`      VARCHAR(255)    NULL                    COMMENT '作者卡封面 URL（空则取最新图集封面）',
  `color`          VARCHAR(16)     NOT NULL DEFAULT '#3a3a44' COMMENT '头像渐变主色',
  `bio`            VARCHAR(500)    NULL                    COMMENT '简介（作者主页介绍卡，超出折叠展开）',
  `style_tags`     VARCHAR(128)    NULL                    COMMENT '风格标签（逗号分隔，用于作者搜索）',
  `album_count`    INT UNSIGNED    NOT NULL DEFAULT 0      COMMENT '收录套数（冗余计数）',
  `last_update_at` DATETIME        NULL                    COMMENT '最近更新时间（冗余）',
  `sort_weight`    INT             NOT NULL DEFAULT 0      COMMENT '首页/列表排序权重（大在前）',
  `status`         TINYINT UNSIGNED NOT NULL DEFAULT 1    COMMENT '1=展示 0=隐藏',
  `is_deleted`     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_name` (`name`),
  KEY `idx_status_sort` (`status`, `sort_weight`, `id`)
) ENGINE=InnoDB COMMENT='作者';

-- ---------------------------------------------------------------------
-- 4. 图集表
--    覆盖：首页最近更新（24 套/页）、图集页（排序：最新/热门/收藏；标签筛选；24 套/页）、
--          瀑布流推荐、详情页信息卡（浏览量/压缩包大小/描述）、管理员发布与上下架
-- ---------------------------------------------------------------------
CREATE TABLE `album` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '图集ID',
  `author_id`      BIGINT UNSIGNED NOT NULL                COMMENT '归属作者ID',
  `title`          VARCHAR(128)    NOT NULL                COMMENT '标题（卡片最多两行）',
  `description`    VARCHAR(1000)   NULL                    COMMENT '简介（详情页说明文字）',
  `cover_url`      VARCHAR(255)    NOT NULL                COMMENT '封面 URL（3:4 缩略图）',
  `image_count`    INT UNSIGNED    NOT NULL DEFAULT 0      COMMENT '图片数（如 37P）',
  `video_count`    TINYINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '视频数（如 1V，0 不显示徽章）',
  `package_size`   DECIMAL(10,2)   NOT NULL DEFAULT 0.00   COMMENT '原图压缩包大小（MB，四宫格展示）',
  `points`         SMALLINT UNSIGNED NOT NULL DEFAULT 0   COMMENT '积分解锁消耗（0=不可积分解锁）',
  `view_count`     INT UNSIGNED    NOT NULL DEFAULT 0      COMMENT '浏览量（热门排序依据，冗余）',
  `download_count` INT UNSIGNED    NOT NULL DEFAULT 0      COMMENT '下载次数（冗余，统计用）',
  `fav_count`      INT UNSIGNED    NOT NULL DEFAULT 0      COMMENT '收藏数（收藏排序依据，冗余）',
  `comment_count`  INT UNSIGNED    NOT NULL DEFAULT 0      COMMENT '评论数（冗余）',
  `is_recommended` TINYINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '进入瀑布流「个人推荐」池',
  `status`         ENUM('draft','published','offline') NOT NULL DEFAULT 'draft'
                   COMMENT '状态：草稿/已发布/已下架（管理员发布后进入审核队列）',
  `published_at`   DATETIME        NULL                    COMMENT '发布时间（最新排序依据）',
  `created_by`     BIGINT UNSIGNED NOT NULL                COMMENT '发布管理员 user.id（仅管理员可发布）',
  `is_deleted`     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_author_status` (`author_id`, `status`, `published_at`),
  KEY `idx_pub_new` (`status`, `published_at`, `id`)          COMMENT '图集页「最新」排序',
  KEY `idx_pub_hot` (`status`, `view_count`, `id`)            COMMENT '图集页「热门」排序',
  KEY `idx_pub_fav` (`status`, `fav_count`, `id`)             COMMENT '图集页「收藏」排序',
  KEY `idx_pub_rec` (`status`, `is_recommended`, `published_at`) COMMENT '瀑布流「个人推荐」池',
  KEY `idx_created_by` (`created_by`)
) ENGINE=InnoDB COMMENT='图集';

-- ---------------------------------------------------------------------
-- 5. 图集媒体表（图片 + 视频）
--    覆盖：详情页图片卡片（右下角 当前/总数）、视频卡片置顶、
--          未解锁只看前 3 张（应用层按 sort_order <= 3 过滤）
--    取图规则：未解锁（游客/注册会员）预览前 3 张取 watermark_url（开关关闭时取原图）；
--              积分解锁后的在线查看与下载、付费会员在线查看与下载一律取原图 url
-- ---------------------------------------------------------------------
CREATE TABLE `album_image` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `album_id`    BIGINT UNSIGNED NOT NULL COMMENT '图集ID',
  `media_type`  ENUM('image','video') NOT NULL DEFAULT 'image' COMMENT '类型：图片/视频',
  `url`         VARCHAR(255)   NOT NULL COMMENT '原图 URL（对象存储+签名防盗链）',
  `thumb_url`   VARCHAR(255)   NULL     COMMENT '缩略图 URL（多尺寸可另建 CDN 规则）',
  `watermark_url` VARCHAR(255) NULL     COMMENT '水印版图 URL（仅未解锁预览用；积分解锁/付费会员一律取原图）',
  `width`       SMALLINT UNSIGNED NULL,
  `height`      SMALLINT UNSIGNED NULL,
  `duration`    SMALLINT UNSIGNED NULL COMMENT '视频时长（秒）',
  `sort_order`  SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '展示顺序（1 起；1-3 为预览位）',
  `is_deleted`  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_album_sort` (`album_id`, `media_type`, `sort_order`)
) ENGINE=InnoDB COMMENT='图集媒体（图片/视频）';

-- ---------------------------------------------------------------------
-- 6. 标签表
--    覆盖：标签云（#前缀 + 收录数、字号按套数 5 档分级）、标签结果页；
--          管理后台「标签管理」：新建 / 重命名（同步 album_tag 展示）/ 隐藏（前台不展示、
--          图集发布与编辑不可再选）/ 删除（仅未被收录的标签可删，软删除）
-- ---------------------------------------------------------------------
CREATE TABLE `tag` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(32) NOT NULL COMMENT '标签名（展示时统一加 # 前缀，唯一）',
  `use_count`  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '收录套数（冗余计数，图集发布/编辑/删除时同步）',
  `status`     TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=展示 0=隐藏（后台标签管理控制）',
  `created_by` BIGINT UNSIGNED NULL COMMENT '创建管理员（后台新建时记录）',
  `is_deleted` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '软删除（仅未收录标签可删）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_name` (`name`),
  KEY `idx_count` (`use_count`),
  KEY `idx_status_count` (`status`, `use_count`) COMMENT '前台标签云按展示状态 + 收录数排序'
) ENGINE=InnoDB COMMENT='标签';

-- ---------------------------------------------------------------------
-- 7. 图集-标签关联表
--    覆盖：图集页按标签筛选、详情页标签 chips、瀑布流「继续浏览」关联标签
-- ---------------------------------------------------------------------
CREATE TABLE `album_tag` (
  `id`       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `album_id` BIGINT UNSIGNED NOT NULL,
  `tag_id`   BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_album_tag` (`album_id`, `tag_id`),
  KEY `idx_tag_album` (`tag_id`, `album_id`) COMMENT '按标签取图集'
) ENGINE=InnoDB COMMENT='图集-标签关联';

-- ---------------------------------------------------------------------
-- 8. 公告表
--    覆盖：首页公告 4 条、公告页列表（置顶优先、8 条/页）、搜索（标题/摘要/正文/类型）、
--          详情弹层（类型标签 + 分段正文）
-- ---------------------------------------------------------------------
CREATE TABLE `announcement` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '公告ID',
  `type`        ENUM('update','activity','maintain','rule','notice')
                NOT NULL DEFAULT 'notice' COMMENT '类型：更新/活动/维护/规则/通知（置顶是展示属性，用 is_top 表达，不占类型）',
  `title`       VARCHAR(128) NOT NULL COMMENT '标题',
  `summary`     VARCHAR(255) NULL    COMMENT '摘要（列表展示）',
  `content`     TEXT         NULL    COMMENT '正文（分段，按 \n\n 切分展示）',
  `is_top`      TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '置顶（排首位，玫红标签）',
  `status`      TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=发布 0=下线',
  `published_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间',
  `created_by`  BIGINT UNSIGNED NOT NULL COMMENT '发布管理员',
  `is_deleted`  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status_top` (`status`, `is_top`, `published_at`),
  FULLTEXT KEY `ft_search` (`title`, `summary`, `content`) WITH PARSER ngram COMMENT '公告搜索'
) ENGINE=InnoDB COMMENT='公告';

-- ---------------------------------------------------------------------
-- 9. 用户通知表
--    覆盖：我的通知（类型图标 审核/更新/权益/系统、未读红点、点击弹详情、
--          全部标为已读、5 条/页分页）
--    更新类型通知可携带 album_id，详情弹窗渲染关联图集卡片并跳转图集详情页
-- ---------------------------------------------------------------------
CREATE TABLE `user_notification` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL COMMENT '接收用户',
  `type`       ENUM('review','update','benefit','system') NOT NULL DEFAULT 'system'
               COMMENT '类型：审核结果/作者更新/权益变更/系统',
  `title`      VARCHAR(128) NOT NULL COMMENT '标题',
  `content`    VARCHAR(1000) NOT NULL COMMENT '描述正文',
  `album_id`   BIGINT UNSIGNED NULL COMMENT '关联图集（type=update 时用于跳转详情页）',
  `is_read`    TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0=未读（红点）1=已读',
  `read_at`    DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '通知时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_read` (`user_id`, `is_read`, `id`),
  KEY `idx_user_type` (`user_id`, `type`, `id`)
) ENGINE=InnoDB COMMENT='用户通知';

-- ---------------------------------------------------------------------
-- 10. 收藏表
--     覆盖：卡片右下角星标一键收藏/取消、详情页收藏按钮、我的收藏（12 套/页）、
--           图集页「收藏」排序的计数来源
-- ---------------------------------------------------------------------
CREATE TABLE `favorite` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `album_id`   BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_album` (`user_id`, `album_id`) COMMENT '防重复收藏',
  KEY `idx_user_time` (`user_id`, `created_at`),
  KEY `idx_album` (`album_id`)
) ENGINE=InnoDB COMMENT='图集收藏';

-- ---------------------------------------------------------------------
-- 11. 作者订阅表
--     覆盖：作者主页订阅/已订阅按钮、详情页订阅 chip、个人中心已订阅作者（12 位/页）、
--           作者更新时批量发通知（type=update）
-- ---------------------------------------------------------------------
CREATE TABLE `subscription` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `author_id`  BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '订阅时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_author` (`user_id`, `author_id`) COMMENT '防重复订阅',
  KEY `idx_author` (`author_id`),
  KEY `idx_user_time` (`user_id`, `created_at`)
) ENGINE=InnoDB COMMENT='作者订阅';

-- ---------------------------------------------------------------------
-- 12. 会员套餐表
--     覆盖：会员页两张卡片的定价配置（v1 仅「月卡 ¥19」，无小会员）
-- ---------------------------------------------------------------------
CREATE TABLE `membership_plan` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(32) NOT NULL COMMENT '套餐编码：monthly=月卡',
  `name`        VARCHAR(64) NOT NULL COMMENT '套餐名（付费会员 · 月卡）',
  `price_cents` INT UNSIGNED NOT NULL COMMENT '价格（分），1900=¥19/月',
  `duration_days` SMALLINT UNSIGNED NOT NULL DEFAULT 30 COMMENT '有效天数（续费在剩余时间上叠加）',
  `benefits`    VARCHAR(1000) NULL COMMENT '权益文案（JSON 数组）',
  `status`      TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=上架 0=下架',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB COMMENT='会员套餐';

-- ---------------------------------------------------------------------
-- 13. 支付订单表
--     覆盖：付费会员开通/续费（¥19/月）、积分解锁单套图集（积分也是一种支付方式）、
--           我的购买三格统计（累计消费/会员订单数/已解锁数）、会员订单卡与续费
--     v1 支付渠道仅支付宝
-- ---------------------------------------------------------------------
CREATE TABLE `pay_order` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no`     VARCHAR(32) NOT NULL COMMENT '订单号（展示用，如 SV20261117xxxx）',
  `user_id`      BIGINT UNSIGNED NOT NULL COMMENT '下单用户',
  `biz_type`     ENUM('vip','unlock') NOT NULL COMMENT '业务：会员开通/图集解锁',
  `plan_id`      BIGINT UNSIGNED NULL COMMENT '会员套餐ID（biz_type=vip 时）',
  `album_id`     BIGINT UNSIGNED NULL COMMENT '图集ID（biz_type=unlock 时）',
  `pay_type`     ENUM('alipay','points','admin') NOT NULL DEFAULT 'alipay'
                 COMMENT '支付方式：支付宝 / 积分（解锁用积分抵扣）/ 管理员赠送（后台赠送会员的 0 元单）',
  `amount_cents` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '现金金额（分），积分支付为 0',
  `points_cost`  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '消耗积分，现金支付为 0',
  `vip_days`     SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '会员天数（续费叠加）',
  `status`       ENUM('created','paid','closed','refunded') NOT NULL DEFAULT 'created'
                 COMMENT '订单状态',
  `trade_no`     VARCHAR(64) NULL COMMENT '支付宝流水号',
  `paid_at`      DATETIME NULL COMMENT '支付时间（订单卡展示）',
  `refund_at`    DATETIME NULL COMMENT '退款时间（status=refunded 时，后台退款留痕）',
  `refund_reason` VARCHAR(255) NULL COMMENT '退款原因（后台退款时填写/选择）',
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user_biz` (`user_id`, `biz_type`, `status`, `paid_at`) COMMENT '我的购买列表与统计',
  KEY `idx_status_paid` (`status`, `paid_at`) COMMENT '后台支付流水页营收统计（累计/今日/按业务）',
  KEY `idx_album` (`album_id`)
) ENGINE=InnoDB COMMENT='支付订单（会员/解锁）';

-- ---------------------------------------------------------------------
-- 14. 图集解锁表
--     覆盖：解锁判定（未解锁只看前 3 张 ↔ 解锁后查看全部+下载，与付费会员等效）、
--           我的购买「图集解锁」卡片（消耗积分、可重复下载）、退出登录本地记录保留
-- ---------------------------------------------------------------------
CREATE TABLE `album_unlock` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `album_id`   BIGINT UNSIGNED NOT NULL,
  `order_id`   BIGINT UNSIGNED NULL COMMENT '来源订单（积分解锁也落 pay_order）',
  `points_cost` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '消耗积分快照',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '解锁时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_album` (`user_id`, `album_id`) COMMENT '同一图集只解锁一次',
  KEY `idx_user_time` (`user_id`, `created_at`),
  KEY `idx_album` (`album_id`)
) ENGINE=InnoDB COMMENT='图集解锁记录';

-- ---------------------------------------------------------------------
-- 15. 评论表（一级评论 + 嵌套回复）
--     覆盖：详情页评论区（先审后发、审核状态标签、回复@某人、本人可删除、
--           删除二次确认）、管理员评论审核
-- ---------------------------------------------------------------------
CREATE TABLE `comment` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `album_id`   BIGINT UNSIGNED NOT NULL COMMENT '图集ID',
  `user_id`    BIGINT UNSIGNED NOT NULL COMMENT '评论人',
  `parent_id`  BIGINT UNSIGNED NULL COMMENT '父评论ID（NULL=一级评论）',
  `reply_to_user_id` BIGINT UNSIGNED NULL COMMENT '回复目标用户（展示 回复 @某人）',
  `content`    VARCHAR(500) NOT NULL COMMENT '内容',
  `status`     ENUM('pending','approved','rejected','deleted') NOT NULL DEFAULT 'pending'
               COMMENT '状态：待审核（先审后发，仅本人可见）/已通过/未通过/已删除',
  `is_deleted` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评论时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_album_status` (`album_id`, `status`, `created_at`),
  KEY `idx_user` (`user_id`),
  KEY `idx_parent` (`parent_id`)
) ENGINE=InnoDB COMMENT='评论/回复';

-- ---------------------------------------------------------------------
-- 16. 友情链接表
--     覆盖：页脚友链胶囊（站名 + 一句简介，可横向扩展）
-- ---------------------------------------------------------------------
CREATE TABLE `friend_link` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(32) NOT NULL COMMENT '站名（粗体）',
  `slogan`     VARCHAR(64) NULL    COMMENT '一句简介（如 发现好剧 下载好剧）',
  `url`        VARCHAR(255) NOT NULL,
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `status`     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status_sort` (`status`, `sort_order`)
) ENGINE=InnoDB COMMENT='友情链接';

-- ---------------------------------------------------------------------
-- 17. 系统字典类型表
--     覆盖：字典分组管理。业务表中的枚举字段（公告类型、通知类型、订单状态等）
--     的「值 → 文案/样式/排序」不再散落代码，统一挂到字典，后台可维护
-- ---------------------------------------------------------------------
CREATE TABLE `sys_dict_type` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '字典类型ID',
  `type_code`  VARCHAR(64)     NOT NULL                COMMENT '类型编码（唯一，如 notice_type）',
  `type_name`  VARCHAR(64)     NOT NULL                COMMENT '类型名称（如 公告类型）',
  `remark`     VARCHAR(255)    NULL                    COMMENT '备注说明',
  `status`     TINYINT UNSIGNED NOT NULL DEFAULT 1    COMMENT '1=启用 0=停用',
  `is_system`  TINYINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '1=内置字典（禁止删除）0=自定义',
  `is_deleted` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_code` (`type_code`)
) ENGINE=InnoDB COMMENT='系统字典类型';

-- ---------------------------------------------------------------------
-- 18. 系统字典项表
--     覆盖：每个字典类型下的枚举项（值 + 中文标签 + 样式类 + 排序），
--           前端下拉/标签徽章文案与后端校验共用此配置
-- ---------------------------------------------------------------------
CREATE TABLE `sys_dict_data` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '字典项ID',
  `type_code`  VARCHAR(64)     NOT NULL                COMMENT '所属字典类型编码（冗余，便于直查）',
  `dict_value` VARCHAR(32)     NOT NULL                COMMENT '字典项值（与业务枚举值一致）',
  `dict_label` VARCHAR(64)     NOT NULL                COMMENT '展示文案（如 置顶 / 付费会员）',
  `style_class` VARCHAR(32)    NULL                    COMMENT '样式类（标签配色，如 red / amber / gray）',
  `extra`      VARCHAR(255)    NULL                    COMMENT '扩展 JSON（图标、跳转等附加配置）',
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0   COMMENT '排序（小在前）',
  `status`     TINYINT UNSIGNED NOT NULL DEFAULT 1    COMMENT '1=启用 0=停用',
  `is_deleted` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_value` (`type_code`, `dict_value`) COMMENT '同类型下值唯一',
  KEY `idx_type_sort` (`type_code`, `status`, `sort_order`)
) ENGINE=InnoDB COMMENT='系统字典项';

-- ---------------------------------------------------------------------
-- 19. 站点配置表
--     覆盖：页脚版权文案、ICP 备案号、年龄声明/免责声明、未解锁预览水印开关、
--           友链开关等站点级配置（技术支撑 · 安全与合规）
-- ---------------------------------------------------------------------
CREATE TABLE `sys_config` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `config_key`   VARCHAR(64)  NOT NULL COMMENT '配置键（唯一，如 site.icp_no）',
  `config_value` TEXT         NULL     COMMENT '配置值（字符串或 JSON）',
  `remark`       VARCHAR(255) NULL     COMMENT '说明（后台配置项标题）',
  `updated_by`   BIGINT UNSIGNED NULL  COMMENT '最后修改管理员',
  `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`)
) ENGINE=InnoDB COMMENT='站点配置';

-- ---------------------------------------------------------------------
-- 20. 浏览记录表
--     覆盖：详情页浏览量累加（album.view_count 的明细来源）、技术支撑「PV/UV」、
--           瀑布流「个人推荐：按浏览与收藏偏好推荐」（浏览偏好 = 用户最近浏览的
--           图集标签分布）
-- ---------------------------------------------------------------------
CREATE TABLE `user_view_log` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NULL COMMENT '用户ID（NULL=游客）',
  `visitor_id` VARCHAR(64) NULL COMMENT '游客标识（cookie/fingerprint，UV 统计用）',
  `album_id`   BIGINT UNSIGNED NOT NULL COMMENT '浏览的图集',
  `view_date`  DATE NOT NULL COMMENT '浏览日期（按日去重统计 UV）',
  `ip`         VARCHAR(45) NULL COMMENT '来源 IP（IPv6 兼容）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_album_date` (`album_id`, `view_date`) COMMENT '图集按日 PV/UV',
  KEY `idx_user_time` (`user_id`, `created_at`) COMMENT '用户近期浏览偏好',
  KEY `idx_visitor` (`visitor_id`, `view_date`)
) ENGINE=InnoDB COMMENT='浏览记录';

-- ---------------------------------------------------------------------
-- 21. 下载记录表
--     覆盖：已解锁/付费会员的「打包下载原图」行为留痕、下载次数统计
--           （album.download_count 明细来源）、异常高频下载风控
-- ---------------------------------------------------------------------
CREATE TABLE `download_log` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL COMMENT '下载用户（下载需已解锁或付费会员）',
  `album_id`   BIGINT UNSIGNED NOT NULL COMMENT '下载的图集',
  `download_date` DATE NOT NULL COMMENT '下载日期',
  `ip`         VARCHAR(45) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_date` (`user_id`, `download_date`) COMMENT '按日限次风控',
  KEY `idx_album_date` (`album_id`, `download_date`)
) ENGINE=InnoDB COMMENT='下载记录';

-- ---------------------------------------------------------------------
-- 22. 搜索日志表
--     覆盖：技术支撑「搜索词与标签热度统计」——顶部搜索框（图集）、
--           公告页搜索、作者列表页搜索三个场景
-- ---------------------------------------------------------------------
CREATE TABLE `search_log` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scene`        ENUM('album','announcement','author') NOT NULL DEFAULT 'album'
                 COMMENT '搜索场景：图集/公告/作者',
  `keyword`      VARCHAR(64) NOT NULL COMMENT '搜索词',
  `user_id`      BIGINT UNSIGNED NULL COMMENT '搜索用户（NULL=游客）',
  `result_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '命中条数（0 结果的热词需重点关注）',
  `search_date`  DATE NOT NULL COMMENT '搜索日期',
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_scene_kw` (`scene`, `keyword`, `search_date`) COMMENT '热词统计',
  KEY `idx_date` (`search_date`)
) ENGINE=InnoDB COMMENT='搜索日志';

-- ---------------------------------------------------------------------
-- 23. 验证码表
--     覆盖：技术支撑「邮箱验证」——注册验证邮箱、找回密码（预留）
-- ---------------------------------------------------------------------
CREATE TABLE `verify_code` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`      VARCHAR(128) NOT NULL COMMENT '目标邮箱',
  `scene`      ENUM('register','reset_password') NOT NULL DEFAULT 'register'
               COMMENT '用途：注册验证/找回密码',
  `code`       VARCHAR(8) NOT NULL COMMENT '验证码',
  `expired_at` DATETIME NOT NULL COMMENT '过期时间（建议 10 分钟）',
  `used_at`    DATETIME NULL COMMENT '使用时间（一次性）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email_scene` (`email`, `scene`, `created_at`)
) ENGINE=InnoDB COMMENT='验证码';

-- ---------------------------------------------------------------------
-- 24. 管理操作日志表
--     覆盖：管理后台留痕——发布图集、上下架、评论审核、公告发布、
--           友链/配置修改（管理员是唯一可发布角色，操作需可追溯）
-- ---------------------------------------------------------------------
CREATE TABLE `admin_op_log` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_id`    BIGINT UNSIGNED NOT NULL COMMENT '操作管理员 user.id',
  `action`      VARCHAR(64) NOT NULL COMMENT '动作（album.publish / album.draft / album.offline / album.recommend / album.unrecommend / tag.create / tag.edit / tag.hide / tag.show / tag.delete / comment.review / comment.delete / announcement.publish / author.create / author.hide / author.show / user.points / user.grantvip / user.resetpwd / config.update / config.plan / order.refund / pay.export 等）',
  `target_type` VARCHAR(32) NULL COMMENT '目标类型（album/tag/comment/announcement/author/user/config/order…）',
  `target_id`   BIGINT UNSIGNED NULL COMMENT '目标ID',
  `detail`      VARCHAR(1000) NULL COMMENT '变更详情（JSON，如审核结果、修改前后值、积分调整前后值、赠送会员天数）',
  `ip`          VARCHAR(45) NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin_time` (`admin_id`, `created_at`),
  KEY `idx_target` (`target_type`, `target_id`)
) ENGINE=InnoDB COMMENT='管理操作日志';

-- =====================================================================
-- 初始化数据
-- =====================================================================

-- 会员套餐：仅月卡 ¥19（无小会员）
INSERT INTO `membership_plan` (`code`, `name`, `price_cents`, `duration_days`, `benefits`) VALUES
('monthly', '付费会员 · 月卡', 1900, 30,
 '["全站图集在线畅看","不限量打包下载无水印原图","新图提前 3 天看","专属客服"]');

-- 管理员账号（密码请上线前重置；原型演示 admin@sylvie.cc）
INSERT INTO `user` (`email`, `password_hash`, `nickname`, `avatar_type`, `avatar_index`, `role`, `points`)
VALUES ('admin@sylvie.cc', '$2a$10$REPLACE_ME_BEFORE_PROD', '管理员', 0, 0, 'admin', 0);

-- 示例作者（与后台原型 AUTHORS 对应，可按需增删；sort_weight 越大前台越靠前，status=0 前台隐藏）
INSERT INTO `author` (`name`, `alias`, `initial`, `color`, `bio`, `style_tags`, `sort_weight`, `status`) VALUES
('铃木美咲', 'suzuki,Misaki', '铃', '#ff2d55', '日系写真人像，专注胶片质感与自然光。', '日系,胶片,人像', 20, 1),
('白露',     '',              '白', '#8e7cff', '清新自然风格，常拍室内窗景与私房写真。', '清新,室内,私房', 16, 1),
('南栀',     'nanzhi',        '南', '#ff9f43', '都市感写真与街拍，色彩浓烈。', '街拍,都市', 14, 1),
('桃夭',     'taoyao',        '桃', '#ff6b9d', '甜美少女风，致力于捕捉最自然的一瞬间。', '甜美,少女', 12, 1),
('青芷',     'qingzhi',       '青', '#4ecdc4', '国风与汉服写真。', '国风,汉服', 10, 1),
('素荷',     'suhe',          '素', '#a8e6cf', '极简光影，黑白与低饱和色调。', '黑白,极简', 8, 1),
('林熙',     'linxi',         '林', '#f39c12', '旅拍与外景写真。', '旅拍,外景', 6, 1);

-- 示例标签（与后台原型 TAGS 对应；use_count 为冗余计数，status=1 前台标签云展示）
INSERT INTO `tag` (`name`, `use_count`, `status`) VALUES
('日系', 128, 1), ('胶片', 86, 1), ('清新', 74, 1), ('私房', 52, 1),
('街拍', 63, 1), ('都市', 47, 1), ('甜美', 69, 1), ('少女', 58, 1),
('国风', 44, 1), ('汉服', 39, 1), ('黑白', 28, 1), ('极简', 21, 1),
('旅拍', 57, 1), ('外景', 49, 1), ('室内', 66, 1), ('人像', 92, 1);

-- 友情链接示例（页脚胶囊）
INSERT INTO `friend_link` (`name`, `slogan`, `url`, `sort_order`) VALUES
('片舟', '发现好剧 下载好剧', 'https://example.com', 1);

-- 站点配置（页脚/合规文案，后台可改）
INSERT INTO `sys_config` (`config_key`, `config_value`, `remark`) VALUES
('site.name',        '希尔薇图集',                              '站点名称'),
('site.copyright',   '© 2020-2026 希尔薇图集. All rights reserved.', '页脚版权文案'),
('site.icp_no',      '',                                       'ICP 备案号（备案后填写）'),
('site.age_statement', '本站内容仅供成年人浏览，进入即视为已知悉并同意。', '年龄声明'),
('site.disclaimer',  '所有图集仅由管理员发布，版权归原作者所有。', '内容免责声明'),
('image.watermark_on', '1',                                    '未解锁预览是否使用水印版（1=开启；解锁/会员始终原图）'),
('checkin.points',   '2',                                       '每日签到积分');

-- 系统字典类型（内置分组，与业务枚举一一对应）
INSERT INTO `sys_dict_type` (`type_code`, `type_name`, `remark`, `is_system`) VALUES
('announcement_type', '公告类型',   '公告列表/首页公告的类型标签', 1),
('notify_type',       '通知类型',   '我的通知的类型图标与标签（审核/更新/权益/系统）', 1),
('album_status',      '图集状态',   '管理员发布流程：草稿/已发布/已下架', 1),
('comment_status',    '评论状态',   '评论区先审后发的审核状态', 1),
('order_status',      '订单状态',   '我的购买订单卡的状态展示', 1),
('pay_type',          '支付方式',   'v1 仅支付宝；积分解锁单独配置', 1),
('user_role',         '用户角色',   '注册会员/付费会员/管理员徽章文案', 1),
('sort_type',         '图集排序',   '图集页排序维度：最新/热门/收藏', 1),
('member_badge',      '会员徽章',   '评论区/个人中心的等级徽章文案', 1);

-- 系统字典项
INSERT INTO `sys_dict_data` (`type_code`, `dict_value`, `dict_label`, `style_class`, `sort_order`) VALUES
-- 公告类型（置顶用 announcement.is_top 表达，不作为类型字典项；类型均灰色标签）
('announcement_type', 'update',   '更新', 'gray', 1),
('announcement_type', 'activity', '活动', 'gray', 2),
('announcement_type', 'maintain', '维护', 'gray', 3),
('announcement_type', 'rule',     '规则', 'gray', 4),
('announcement_type', 'notice',   '通知', 'gray', 5),
-- 通知类型（四种图标配色）
('notify_type', 'review',  '审核', 'blue',  1),
('notify_type', 'update',  '更新', 'green', 2),
('notify_type', 'benefit', '权益', 'amber', 3),
('notify_type', 'system',  '系统', 'gray',  4),
-- 图集状态
('album_status', 'draft',    '草稿',   'gray',  1),
('album_status', 'published','已发布', 'green', 2),
('album_status', 'offline',  '已下架', 'red',   3),
-- 评论状态（先审后发）
('comment_status', 'pending',  '待审核', 'amber', 1),
('comment_status', 'approved', '已通过', 'green', 2),
('comment_status', 'rejected', '未通过', 'red',   3),
('comment_status', 'deleted',  '已删除', 'gray',  4),
-- 订单状态
('order_status', 'created',  '待支付', 'amber', 1),
('order_status', 'paid',     '已支付', 'green', 2),
('order_status', 'closed',   '已关闭', 'gray',  3),
('order_status', 'refunded', '已退款', 'red',   4),
-- 支付方式
-- 支付方式（admin=管理员赠送会员的 0 元单，仅后台赠送时生成）
('pay_type', 'alipay', '支付宝', 'blue', 1),
('pay_type', 'points', '积分',   'red',  2),
('pay_type', 'admin',  '管理员赠送', 'gray', 3),
-- 用户角色
('user_role', 'member', '注册会员', 'gray', 1),
('user_role', 'vip',    '付费会员', 'red',  2),
('user_role', 'admin',  '管理员',   'blue', 3),
-- 图集排序
('sort_type', 'new',  '最新', 'red',  1),
('sort_type', 'hot',  '热门', 'gray', 2),
('sort_type', 'fav',  '收藏', 'gray', 3),
-- 会员徽章
('member_badge', 'member', '注册会员', 'gray', 1),
('member_badge', 'vip',    '付费会员', 'gold', 2);
