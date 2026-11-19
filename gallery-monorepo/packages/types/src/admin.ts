/**
 * 管理后台 DTO：与 `/api/admin/*` 响应及后台页面表格字段对应。
 * 金额统一为「分」（`*Cents`），时间统一为北京时间字符串；
 * 后台列表统一复用 `PageResult<T>`，部分页面在其上附加汇总字段。
 */
import type {
  AnnouncementType,
  CommentStatus,
  OrderStatus,
  PayType,
  Role,
} from './constants.js';
import type { PageResult } from './common.js';
import type { TagDto, UserProfile } from './dto.js';

/** 管理员登录后返回的资料（与前台共用 JWT 结构与用户表）。 */
export type AdminProfile = UserProfile;

/** 后台图集状态：草稿 / 已发布 / 已下架。 */
export type AdminAlbumStatus = 'draft' | 'published' | 'offline';

/**
 * 后台图集列表行。
 * 内联作者字段避免额外请求；`imageCount` / `videoCount` 为媒体数量，
 * `publishedAt` 为空表示未发布，`createdAt` 为创建时间。
 */
export interface AdminAlbumRow {
  id: number;
  title: string;
  coverUrl: string;
  authorId: number;
  authorName: string;
  authorInitial: string;
  authorColor: string;
  authorAvatarUrl: string | null;
  imageCount: number;
  videoCount: number;
  points: number;
  viewCount: number;
  favCount: number;
  isRecommended: boolean;
  status: AdminAlbumStatus;
  publishedAt: string | null;
  createdAt: string;
}

/**
 * 后台媒体输入项：编辑态可带 `id`（已存在），新增时省略。
 * 视频使用 `duration`（秒）；`size` 为字节，`filename` 用于展示。
 */
export interface AdminMediaInput {
  id?: number;
  url: string;
  thumbUrl?: string | null;
  watermarkUrl?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  size?: number;
  filename?: string;
}

/** 后台图集详情：在列表行基础上补充描述、标签与媒体列表。 */
export interface AdminAlbumDetail extends AdminAlbumRow {
  description: string | null;
  tags: TagDto[];
  images: AdminMediaInput[];
  videos: AdminMediaInput[];
}

/**
 * 后台保存图集请求体。
 * `status` 省略时按草稿处理；`tagIds` 为标签主键数组；
 * `coverUrl` 为空时由首张图片封面兜底（服务端规则）。
 */
export interface AdminAlbumSaveInput {
  title: string;
  authorId: number;
  points: number;
  description?: string;
  tagIds: number[];
  coverUrl?: string | null;
  status?: AdminAlbumStatus;
  images: AdminMediaInput[];
  videos: AdminMediaInput[];
}

/** 后台标签行；`useCount` 为收录数，`status` 为 1 展示 / 0 隐藏。 */
export interface AdminTagRow {
  id: number;
  name: string;
  useCount: number;
  status: number;
  createdAt: string;
}

/** 后台作者行；`albumCount` 为图集数（冗余计数），`status` 为 1 展示 / 0 隐藏。 */
export interface AdminAuthorRow {
  id: number;
  name: string;
  alias: string | null;
  initial: string;
  color: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  styleTags: string[];
  sortWeight: number;
  status: number;
  albumCount: number;
  lastUpdateAt: string | null;
  createdAt: string;
}

/** 后台新建 / 编辑作者请求体；可选字段由服务端补默认值。 */
export interface AdminAuthorInput {
  name: string;
  alias?: string;
  initial?: string;
  color?: string;
  avatarUrl?: string | null;
  bio?: string;
  styleTags?: string[];
  sortWeight?: number;
}

/** 后台评论作者摘要。 */
export interface AdminCommentUser {
  id: number;
  nickname: string;
  avatarType: number;
  avatarIndex: number;
  avatarUrl: string | null;
  role: Role;
}

/** 后台评论行；同时带出图集标题与回复对象，便于审核列表展示。 */
export interface AdminCommentRow {
  id: number;
  albumId: number;
  albumTitle: string;
  parentId: number | null;
  replyToName: string | null;
  content: string;
  status: CommentStatus;
  createdAt: string;
  user: AdminCommentUser;
}

/** 后台公告行；`status` 控制上线状态（1 上线 / 0 下线）。 */
export interface AdminAnnouncementRow {
  id: number;
  type: AnnouncementType;
  typeLabel: string;
  title: string;
  summary: string | null;
  content: string | null;
  isTop: boolean;
  status: number;
  publishedAt: string;
  createdAt: string;
}

/** 后台公告新建 / 编辑请求体。 */
export interface AdminAnnouncementInput {
  type: AnnouncementType;
  title: string;
  summary?: string;
  content?: string;
  isTop?: boolean;
}

/** 后台订单用户摘要。 */
export interface AdminOrderUser {
  id: number;
  nickname: string;
  email: string;
}

/**
 * 后台订单 / 支付流水行。
 * `tradeNo` 为支付宝交易流水号；`refundAt` / `refundReason` 记录退款信息；
 * 后台赠送订单 `payType=admin` 且金额为 0。
 */
export interface AdminOrderRow {
  id: number;
  orderNo: string;
  user: AdminOrderUser;
  bizType: 'vip' | 'unlock';
  payType: PayType;
  amountCents: number;
  pointsCost: number;
  vipDays: number;
  status: OrderStatus;
  planName: string | null;
  albumTitle: string | null;
  tradeNo: string | null;
  paidAt: string | null;
  refundAt: string | null;
  refundReason: string | null;
  createdAt: string;
}

/**
 * 支付汇总。
 * `totalRevenueCents` / `todayRevenueCents` 为累计与今日收入（分）；
 * `vipCashCents` 为会员现金收入，`unlockPoints` 为积分解锁消耗总量。
 */
export interface AdminPaymentSummary {
  totalRevenueCents: number;
  todayRevenueCents: number;
  todayOrderCount: number;
  vipOrderCount: number;
  vipCashCents: number;
  unlockCount: number;
  unlockPoints: number;
}

/** 订单分页结果 + 顶部汇总卡片数据。 */
export interface AdminOrderPage extends PageResult<AdminOrderRow> {
  summary: AdminPaymentSummary;
}

/** 支付流水导出结果：`filename` 为生成文件名，`count` 为导出行数。 */
export interface AdminOrderExport {
  filename: string;
  count: number;
}

/** 后台用户行；`vipExpireAt` 为空表示非付费会员，`status` 为 1 正常 / 0 封禁。 */
export interface AdminUserRow {
  id: number;
  nickname: string;
  email: string;
  role: Role;
  points: number;
  vipExpireAt: string | null;
  status: number;
  emailVerified: boolean;
  createdAt: string;
}

/** 用户分页结果 + 全量用户数；`totalAll` 不受筛选条件影响。 */
export interface AdminUserPage extends PageResult<AdminUserRow> {
  totalAll: number;
}

/** 重置密码结果：`password` 为随机生成的明文新密码，仅本次返回。 */
export interface AdminResetPasswordResult {
  password: string;
  user: AdminUserRow;
}

/** 站点配置表单：文案字段 + 签到积分 + 预览水印开关。 */
export interface AdminSiteConfig {
  copyright: string;
  icpNo: string;
  ageStatement: string;
  disclaimer: string;
  checkinPoints: number;
  watermarkOn: boolean;
}

/** 会员套餐配置：`priceCents` 为分，`benefits` 为权益文案列表。 */
export interface AdminPlanConfig {
  id: number;
  code: string;
  name: string;
  priceCents: number;
  durationDays: number;
  benefits: string[];
  status: number;
}

/** 友链行；`sortOrder` 越小越靠前。 */
export interface AdminFriendLinkRow {
  id: number;
  name: string;
  slogan: string | null;
  url: string;
  sortOrder: number;
}

/** 站点配置聚合：站点信息 + 会员套餐 + 友链。 */
export interface AdminConfigBundle {
  site: AdminSiteConfig;
  plan: AdminPlanConfig;
  friendLinks: AdminFriendLinkRow[];
}

/** 后台操作日志行；`actionLabel` 为动作中文名，`targetType` / `targetId` 指向操作对象。 */
export interface AdminLogRow {
  id: number;
  adminId: number;
  adminName: string;
  action: string;
  actionLabel: string;
  targetType: string | null;
  targetId: number | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

/**
 * 后台看板数据。
 * `today` 为今日经营指标（收入分、订单、解锁、新用户、PV/UV）；
 * `site` 为全站存量与本月新增；`todos` 为待处理事项；
 * `recentAlbums` 最近图集，`hotKeywords` 搜索热词。
 */
export interface AdminDashboard {
  date: string;
  today: {
    revenueCents: number;
    orderCount: number;
    unlockCount: number;
    unlockPoints: number;
    newUsers: number;
    pv: number;
    uv: number;
  };
  site: {
    albumTotal: number;
    publishedAlbums: number;
    draftAlbums: number;
    offlineAlbums: number;
    userTotal: number;
    monthNewUsers: number;
    vipTotal: number;
    monthNewVip: number;
    pendingComments: number;
  };
  todos: {
    pendingComments: number;
    draftAlbums: number;
    offlineAlbums: number;
    todayOrders: number;
  };
  recentAlbums: AdminAlbumRow[];
  hotKeywords: Array<{ keyword: string; count: number }>;
}

/** 收入趋势时间范围：近 7 天 / 近 30 天 / 近 6 个月。 */
export type TrendMode = '7d' | '30d' | '6m';

/** 趋势点：`label` 为横轴文案，`valueCents` 为当日 / 当月收入（分）。 */
export interface TrendPoint {
  label: string;
  date: string;
  valueCents: number;
}

/** 收入趋势：`sumCents` / `avgCents` / `maxCents` 为统计值，`maxLabel` 为峰值标签。 */
export interface AdminTrend {
  mode: TrendMode;
  points: TrendPoint[];
  sumCents: number;
  avgCents: number;
  maxCents: number;
  maxLabel: string;
}

/**
 * 后台媒体上传结果。
 * `key` 为对象存储键，`url` 为访问地址；视频可能带 `duration`（秒），
 * 图片压缩后返回 `width` / `height` 与可选的缩略图 / 水印图地址。
 */
export interface AdminUploadResult {
  url: string;
  key: string;
  mediaType: 'image' | 'video';
  size: number;
  contentType: string;
  filename: string;
  thumbUrl?: string | null;
  watermarkUrl?: string | null;
  width?: number | null;
  height?: number | null;
}

/** Agent 访问令牌权限范围：`read` 只读，`write` 可执行写工具。 */
export type AgentTokenScope = 'read' | 'write';

/**
 * 后台 Agent 令牌行（不含明文令牌）。
 * `tokenPrefix` 为前缀展示；`status` 为启用状态；
 * `lastUsedAt` / `expiresAt` / `revokedAt` 用于审计，`null` 表示无。
 */
export interface AdminAgentTokenRow {
  id: number;
  name: string;
  tokenPrefix: string;
  scope: AgentTokenScope;
  status: number;
  adminId: number;
  adminName: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** 创建 Agent 令牌结果：明文 token 仅此处返回一次，需立即保存。 */
export interface AdminAgentTokenCreateResult {
  token: string;
  item: AdminAgentTokenRow;
}

/** 操作动作中文映射；后台日志筛选与详情共用，键与 `admin_op_log.action` 一致。 */
export const ADMIN_ACTION_LABELS: Record<string, string> = {
  'album.create': '发布图集',
  'album.draft': '保存草稿',
  'album.edit': '编辑图集',
  'album.publish': '发布 / 上架图集',
  'album.offline': '下架图集',
  'album.recommend': '加入推荐池',
  'album.unrecommend': '移出推荐池',
  'album.delete': '删除图集',
  'tag.create': '新建标签',
  'tag.edit': '编辑标签',
  'tag.hide': '隐藏标签',
  'tag.show': '展示标签',
  'tag.delete': '删除标签',
  'author.create': '新建作者',
  'author.edit': '编辑作者',
  'author.hide': '隐藏作者',
  'author.show': '展示作者',
  'author.delete': '删除作者',
  'comment.review': '审核评论',
  'comment.delete': '删除评论',
  'announcement.publish': '发布公告',
  'announcement.edit': '编辑公告',
  'announcement.offline': '下线公告',
  'announcement.delete': '删除公告',
  'user.points': '调整积分',
  'user.grantvip': '赠送会员',
  'user.resetpwd': '重置密码',
  'user.ban': '封禁用户',
  'user.unban': '解除封禁',
  'config.update': '修改站点配置',
  'config.plan': '修改会员套餐',
  'friend.create': '新增友链',
  'friend.delete': '删除友链',
  'order.refund': '订单退款',
  'pay.export': '导出支付流水',
  'agent_token.create': '创建 Agent 令牌',
  'agent_token.revoke': '吊销 Agent 令牌',
  'agent_token.delete': '删除 Agent 令牌',
};

/** 日志动作分组（后台筛选下拉），按业务域归并 `ADMIN_ACTION_LABELS` 的键。 */
export const ADMIN_ACTION_GROUPS: Array<{ label: string; actions: string[] }> = [
  { label: '图集', actions: ['album.create', 'album.draft', 'album.edit', 'album.publish', 'album.offline', 'album.recommend', 'album.unrecommend', 'album.delete'] },
  { label: '评论', actions: ['comment.review', 'comment.delete'] },
  { label: '公告', actions: ['announcement.publish', 'announcement.edit', 'announcement.offline', 'announcement.delete'] },
  { label: '标签', actions: ['tag.create', 'tag.edit', 'tag.hide', 'tag.show', 'tag.delete'] },
  { label: '作者', actions: ['author.create', 'author.edit', 'author.hide', 'author.show', 'author.delete'] },
  { label: '用户', actions: ['user.points', 'user.grantvip', 'user.resetpwd', 'user.ban', 'user.unban'] },
  { label: '友链与配置', actions: ['config.update', 'config.plan', 'friend.create', 'friend.delete'] },
  { label: '订单与流水', actions: ['order.refund', 'pay.export'] },
];
