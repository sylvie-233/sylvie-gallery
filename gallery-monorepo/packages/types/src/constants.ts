/**
 * 业务枚举与常量：与数据库字段取值、界面文案保持一致。
 * 角色 / 状态类常量同时提供 `as const` 取值映射、联合类型与中文标签。
 */

/** 角色取值：与 `user.role` 一致；`guest`（游客）不落库，仅在前端表达未登录。 */
export const ROLE = {
  MEMBER: 'member',
  VIP: 'vip',
  ADMIN: 'admin',
} as const;

/** 角色联合类型：`member` 注册会员 / `vip` 付费会员 / `admin` 管理员。 */
export type Role = (typeof ROLE)[keyof typeof ROLE];
/** 当前生效角色；VIP 过期后由后端降级，前端按该值判断权益。 */
export type EffectiveRole = Role;

/** 角色中文标签，用于个人中心与后台展示。 */
export const ROLE_LABELS: Record<Role, string> = {
  member: '注册会员',
  vip: '付费会员',
  admin: '管理员',
};

/** 图集列表排序维度：最新 / 热门 / 收藏。 */
export const SORT_TYPE = {
  NEW: 'new',
  HOT: 'hot',
  FAV: 'fav',
} as const;

/** 排序维度联合类型，对应列表查询的 `sort` 参数。 */
export type SortType = (typeof SORT_TYPE)[keyof typeof SORT_TYPE];

/** 排序维度中文标签。 */
export const SORT_LABELS: Record<SortType, string> = {
  new: '最新',
  hot: '热门',
  fav: '收藏',
};

/** 公告类型：对应 `announcement.type`。 */
export const ANNOUNCEMENT_TYPE = {
  UPDATE: 'update',
  ACTIVITY: 'activity',
  MAINTAIN: 'maintain',
  RULE: 'rule',
  NOTICE: 'notice',
} as const;

/** 公告类型联合类型。 */
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPE)[keyof typeof ANNOUNCEMENT_TYPE];

/** 公告类型中文标签，用于前台公告列表与后台筛选。 */
export const ANNOUNCEMENT_TYPE_LABELS: Record<AnnouncementType, string> = {
  update: '更新',
  activity: '活动',
  maintain: '维护',
  rule: '规则',
  notice: '通知',
};

/** 站内通知类型：审核 / 更新 / 权益 / 系统。 */
export const NOTIFICATION_TYPE = {
  REVIEW: 'review',
  UPDATE: 'update',
  BENEFIT: 'benefit',
  SYSTEM: 'system',
} as const;

/** 通知类型联合类型。 */
export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

/** 通知类型中文标签。 */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  review: '审核',
  update: '更新',
  benefit: '权益',
  system: '系统',
};

/** 订单状态：待支付 / 已支付 / 已关闭 / 已退款。 */
export const ORDER_STATUS = {
  CREATED: 'created',
  PAID: 'paid',
  CLOSED: 'closed',
  REFUNDED: 'refunded',
} as const;

/** 订单状态联合类型，与 `order.status` 一致。 */
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/**
 * 支付方式：v1 线上仅支付宝。
 * `points` 表示积分解锁、`admin` 表示后台赠送（0 元订单），均需单独留痕。
 */
export const PAY_TYPE = {
  ALIPAY: 'alipay',
  POINTS: 'points',
  ADMIN: 'admin',
} as const;

/** 支付方式联合类型。 */
export type PayType = (typeof PAY_TYPE)[keyof typeof PAY_TYPE];

/** 评论审核状态：待审 / 通过 / 驳回 / 已删除（软删除）。 */
export const COMMENT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DELETED: 'deleted',
} as const;

/** 评论状态联合类型，与 `comment.status` 一致。 */
export type CommentStatus = (typeof COMMENT_STATUS)[keyof typeof COMMENT_STATUS];

/** 未解锁时允许预览的图片数量（游客与注册会员均为前 3 张）。 */
export const FREE_PREVIEW_COUNT = 3;

/** 头像预设色卡：8 个 CSS 渐变背景，与原型预设一一对应。 */
export const AVATAR_PRESETS = [
  'linear-gradient(135deg,#ff2d55,#ff7a52)',
  'linear-gradient(135deg,#5b8def,#8fc3ff)',
  'linear-gradient(135deg,#2fbf8f,#7fe3bd)',
  'linear-gradient(135deg,#ff8a3d,#ffc46b)',
  'linear-gradient(135deg,#8c63f0,#c49bff)',
  'linear-gradient(135deg,#3f8fd6,#7fc4f0)',
  'linear-gradient(135deg,#e0a53a,#f5d68a)',
  'linear-gradient(135deg,#e05a7a,#f0a3b4)',
] as const;

/** 单张头像上传上限：2MB（字节数，前后端共用校验）。 */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** 图集列表默认每页数量。 */
export const ALBUM_PAGE_SIZE = 24;
