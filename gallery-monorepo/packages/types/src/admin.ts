import type {
  AnnouncementType,
  CommentStatus,
  OrderStatus,
  PayType,
  Role,
} from './constants.js';
import type { PageResult } from './common.js';
import type { TagDto, UserProfile } from './dto.js';

/** 管理员登录后返回的资料（与前台共用 JWT 结构）。 */
export type AdminProfile = UserProfile;

export type AdminAlbumStatus = 'draft' | 'published' | 'offline';

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

export interface AdminAlbumDetail extends AdminAlbumRow {
  description: string | null;
  tags: TagDto[];
  images: AdminMediaInput[];
  videos: AdminMediaInput[];
}

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

export interface AdminTagRow {
  id: number;
  name: string;
  useCount: number;
  status: number;
  createdAt: string;
}

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

export interface AdminCommentUser {
  id: number;
  nickname: string;
  avatarType: number;
  avatarIndex: number;
  avatarUrl: string | null;
  role: Role;
}

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

export interface AdminAnnouncementInput {
  type: AnnouncementType;
  title: string;
  summary?: string;
  content?: string;
  isTop?: boolean;
}

export interface AdminOrderUser {
  id: number;
  nickname: string;
  email: string;
}

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

export interface AdminPaymentSummary {
  totalRevenueCents: number;
  todayRevenueCents: number;
  todayOrderCount: number;
  vipOrderCount: number;
  vipCashCents: number;
  unlockCount: number;
  unlockPoints: number;
}

export interface AdminOrderPage extends PageResult<AdminOrderRow> {
  summary: AdminPaymentSummary;
}

export interface AdminOrderExport {
  filename: string;
  count: number;
}

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

export interface AdminUserPage extends PageResult<AdminUserRow> {
  totalAll: number;
}

export interface AdminResetPasswordResult {
  password: string;
  user: AdminUserRow;
}

export interface AdminSiteConfig {
  copyright: string;
  icpNo: string;
  ageStatement: string;
  disclaimer: string;
  checkinPoints: number;
  watermarkOn: boolean;
}

export interface AdminPlanConfig {
  id: number;
  code: string;
  name: string;
  priceCents: number;
  durationDays: number;
  benefits: string[];
  status: number;
}

export interface AdminFriendLinkRow {
  id: number;
  name: string;
  slogan: string | null;
  url: string;
  sortOrder: number;
}

export interface AdminConfigBundle {
  site: AdminSiteConfig;
  plan: AdminPlanConfig;
  friendLinks: AdminFriendLinkRow[];
}

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

export type TrendMode = '7d' | '30d' | '6m';

export interface TrendPoint {
  label: string;
  date: string;
  valueCents: number;
}

export interface AdminTrend {
  mode: TrendMode;
  points: TrendPoint[];
  sumCents: number;
  avgCents: number;
  maxCents: number;
  maxLabel: string;
}

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

/** Agent 访问令牌权限范围。 */
export type AgentTokenScope = 'read' | 'write';

/** 后台 Agent 令牌行（不含明文令牌）。 */
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

/** 创建 Agent 令牌结果：明文 token 仅此处返回一次。 */
export interface AdminAgentTokenCreateResult {
  token: string;
  item: AdminAgentTokenRow;
}

/** 操作动作中文映射；后台日志筛选与详情共用。 */
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

/** 日志动作分组（后台筛选下拉）。 */
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
