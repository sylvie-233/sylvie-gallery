/** 角色：与 user.role 一致；guest 不落库，只在前端表达未登录。 */
export const ROLE = {
  MEMBER: 'member',
  VIP: 'vip',
  ADMIN: 'admin',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];
export type EffectiveRole = Role;

export const ROLE_LABELS: Record<Role, string> = {
  member: '注册会员',
  vip: '付费会员',
  admin: '管理员',
};

/** 图集排序维度。 */
export const SORT_TYPE = {
  NEW: 'new',
  HOT: 'hot',
  FAV: 'fav',
} as const;

export type SortType = (typeof SORT_TYPE)[keyof typeof SORT_TYPE];

export const SORT_LABELS: Record<SortType, string> = {
  new: '最新',
  hot: '热门',
  fav: '收藏',
};

/** 公告类型。 */
export const ANNOUNCEMENT_TYPE = {
  UPDATE: 'update',
  ACTIVITY: 'activity',
  MAINTAIN: 'maintain',
  RULE: 'rule',
  NOTICE: 'notice',
} as const;

export type AnnouncementType = (typeof ANNOUNCEMENT_TYPE)[keyof typeof ANNOUNCEMENT_TYPE];

export const ANNOUNCEMENT_TYPE_LABELS: Record<AnnouncementType, string> = {
  update: '更新',
  activity: '活动',
  maintain: '维护',
  rule: '规则',
  notice: '通知',
};

/** 通知类型。 */
export const NOTIFICATION_TYPE = {
  REVIEW: 'review',
  UPDATE: 'update',
  BENEFIT: 'benefit',
  SYSTEM: 'system',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  review: '审核',
  update: '更新',
  benefit: '权益',
  system: '系统',
};

/** 订单状态。 */
export const ORDER_STATUS = {
  CREATED: 'created',
  PAID: 'paid',
  CLOSED: 'closed',
  REFUNDED: 'refunded',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** 支付方式：v1 线上仅支付宝，积分与后台赠送单独留痕。 */
export const PAY_TYPE = {
  ALIPAY: 'alipay',
  POINTS: 'points',
  ADMIN: 'admin',
} as const;

export type PayType = (typeof PAY_TYPE)[keyof typeof PAY_TYPE];

/** 评论审核状态。 */
export const COMMENT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DELETED: 'deleted',
} as const;

export type CommentStatus = (typeof COMMENT_STATUS)[keyof typeof COMMENT_STATUS];

/** 未解锁时允许预览的图片数量。 */
export const FREE_PREVIEW_COUNT = 3;

/** 头像预设色卡（渐变底，与原型 8 个预设一一对应）。 */
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

/** 单张头像上传上限：2MB。 */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** 图集列表默认每页数量。 */
export const ALBUM_PAGE_SIZE = 24;
