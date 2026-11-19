/**
 * 前台 DTO：与 API 响应字段一一对应，供 Web 端直接消费。
 * 约定：字段为 camelCase；金额统一以「分」存储（`*Cents`）；时间统一为后端返回的
 * 北京时间字符串（`YYYY-MM-DD HH:mm:ss`），日期展示由 `@sylvie/utils` 处理。
 */
import type {
  AnnouncementType,
  CommentStatus,
  EffectiveRole,
  NotificationType,
  OrderStatus,
  PayType,
  Role,
  SortType,
} from './constants.js';

/**
 * 当前登录用户资料。
 * `role` 为数据库角色，`effectiveRole` 为考虑 VIP 到期后的实际角色；
 * `points` 为可用「解锁积分」，`vipExpireAt` 为空表示非付费会员；
 * `unreadCount` 为未读站内通知数，`isVip` 为权益判断的便捷字段。
 */
export interface UserProfile {
  id: number;
  email: string;
  nickname: string;
  avatarType: number;
  avatarIndex: number;
  avatarUrl: string | null;
  role: Role;
  effectiveRole: EffectiveRole;
  points: number;
  vipExpireAt: string | null;
  emailVerified: boolean;
  createdAt: string;
  unreadCount: number;
  isVip: boolean;
}

/** 登录 / 注册成功结果：`token` 为 JWT，前端以 `Authorization: Bearer` 传递。 */
export interface AuthResult {
  token: string;
  tokenType: 'Bearer';
  expiresIn: number;
  profile: UserProfile;
}

/** 标签 DTO；`useCount` 为收录该标签的图集数（冗余计数）。 */
export interface TagDto {
  id: number;
  name: string;
  useCount: number;
}

/** 图集卡片中的作者摘要；`initial` / `color` 用于无头像时的文字头像。 */
export interface AlbumAuthorDto {
  id: number;
  name: string;
  initial: string;
  color: string;
  avatarUrl: string | null;
}

/**
 * 图集卡片（列表 / 推荐池 / 关联作品共用）。
 * `points` 为解锁所需积分；`packageSize` 为压缩包体积（字节）；
 * `imageCount` / `videoCount` 为媒体数量；`favorited` 表示当前用户是否已收藏。
 */
export interface AlbumCardDto {
  id: number;
  title: string;
  coverUrl: string;
  imageCount: number;
  videoCount: number;
  packageSize: number;
  points: number;
  viewCount: number;
  favCount: number;
  commentCount: number;
  isRecommended: boolean;
  publishedAt: string;
  author: AlbumAuthorDto;
  tags: TagDto[];
  favorited: boolean;
}

/**
 * 图集媒体项。
 * 未解锁预览返回 `watermarkUrl`（前 3 张），解锁 / VIP 返回原图 `url`；
 * 视频的 `duration` 单位为秒，图片为 `null`。
 */
export interface AlbumImageDto {
  id: number;
  mediaType: 'image' | 'video';
  url: string;
  thumbUrl: string | null;
  watermarkUrl: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  sortOrder: number;
}

/** 评论作者摘要；`role` 为生效角色，用于展示会员标识。 */
export interface CommentUserDto {
  id: number;
  nickname: string;
  avatarType: number;
  avatarIndex: number;
  avatarUrl: string | null;
  role: EffectiveRole;
}

/**
 * 评论 DTO（两级结构）。
 * `parentId` 为空表示顶级评论；`replies` 为直接回复；
 * `replyToUserId` / `replyToName` 指向被回复者；`isMine` 便于前端展示删除入口。
 */
export interface CommentDto {
  id: number;
  parentId: number | null;
  replyToUserId: number | null;
  replyToName: string | null;
  content: string;
  status: CommentStatus;
  createdAt: string;
  isMine: boolean;
  user: CommentUserDto;
  replies: CommentDto[];
}

/**
 * 作者详情。
 * `styleTags` 为风格标签；`albumCount` 为图集数（冗余计数）；
 * `lastUpdateAt` 最近更新时间；`sortWeight` 越大越靠前；`subscribed` 当前用户是否订阅。
 */
export interface AuthorDto {
  id: number;
  name: string;
  alias: string | null;
  initial: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  color: string;
  bio: string | null;
  styleTags: string[];
  albumCount: number;
  lastUpdateAt: string | null;
  sortWeight: number;
  subscribed: boolean;
}

/**
 * 图集详情：在卡片基础上补充描述、媒体与访问状态。
 * - `locked` 表示当前用户尚未解锁且非 VIP；`unlocked` 表示已消耗积分解锁；
 * - `canDownload` 综合 VIP / 解锁状态；`previewCount` 可预览张数（默认 3），
 *   `lockedCount` 为剩余锁定张数；`watermark` 表示预览是否返回水印图；
 * - `otherWorks` 为同作者其它作品，`comments` / `commentTotal` 为首屏评论。
 */
export interface AlbumDetailDto extends AlbumCardDto {
  description: string | null;
  status: 'draft' | 'published' | 'offline';
  author: AlbumAuthorDto & {
    bio: string | null;
    albumCount: number;
    subscribed: boolean;
  };
  images: AlbumImageDto[];
  totalImages: number;
  locked: boolean;
  unlocked: boolean;
  isVip: boolean;
  canDownload: boolean;
  previewCount: number;
  lockedCount: number;
  watermark: boolean;
  otherWorks: AlbumCardDto[];
  comments: CommentDto[];
  commentTotal: number;
}

/** 图集列表查询参数；均为可选，服务端提供默认分页与排序。 */
export interface AlbumListQuery {
  page?: number;
  pageSize?: number;
  sort?: SortType;
  tag?: string;
  keyword?: string;
  authorId?: number;
}

/** 公告 DTO；`typeLabel` 为服务端返回的中文类型名，`isTop` 控制置顶。 */
export interface AnnouncementDto {
  id: number;
  type: AnnouncementType;
  typeLabel: string;
  title: string;
  summary: string | null;
  content: string | null;
  isTop: boolean;
  publishedAt: string;
}

/** 通知关联的图集摘要，用于通知列表中跳转详情。 */
export interface NotificationAlbumDto {
  id: number;
  title: string;
  coverUrl: string;
  imageCount: number;
  videoCount: number;
  authorName: string;
  publishedAt: string;
}

/** 站内通知 DTO；`isRead` / `readAt` 记录已读状态。 */
export interface NotificationDto {
  id: number;
  type: NotificationType;
  typeLabel: string;
  title: string;
  content: string;
  album: NotificationAlbumDto | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

/** 会员套餐 DTO；`priceCents` 单位为分，`durationDays` 为有效天数。 */
export interface MembershipPlanDto {
  id: number;
  code: string;
  name: string;
  priceCents: number;
  durationDays: number;
  benefits: string[];
  status: number;
}

/** 友情链接 DTO。 */
export interface FriendLinkDto {
  id: number;
  name: string;
  slogan: string | null;
  url: string;
}

/**
 * 站点启动数据（`site:bootstrap` 缓存）。
 * 汇总站点配置、友链、套餐、标签、作者、最新图集与公告，
 * 供首页一次性渲染；`stats` 为全站统计，`todayAdded` / `latestDate` 用于「今日更新」。
 */
export interface SiteBootstrap {
  config: Record<string, string>;
  friendLinks: FriendLinkDto[];
  plans: MembershipPlanDto[];
  tags: TagDto[];
  authors: AuthorDto[];
  latestAlbums: AlbumCardDto[];
  announcements: AnnouncementDto[];
  todayAdded: number;
  latestDate: string | null;
  stats: {
    albumCount: number;
    authorCount: number;
    imageCount: number;
  };
}

/**
 * 订单 DTO。
 * `bizType` 区分会员购买与积分解锁；`amountCents` 为实付金额（分），
 * `pointsCost` 为积分抵扣（解锁订单），`vipDays` 为开通天数；
 * `tradeNo` 为支付宝交易流水号，支付成功后才写入。
 */
export interface OrderDto {
  id: number;
  orderNo: string;
  bizType: 'vip' | 'unlock';
  payType: PayType;
  amountCents: number;
  pointsCost: number;
  vipDays: number;
  status: OrderStatus;
  planName: string | null;
  albumId: number | null;
  albumTitle: string | null;
  tradeNo: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** 解锁记录 DTO；`pointsCost` 为当时消耗的积分。 */
export interface UnlockDto {
  id: number;
  album: AlbumCardDto;
  pointsCost: number;
  createdAt: string;
}

/** 消费概览：累计消费（分）、会员订单数、已解锁图集数。 */
export interface PurchaseOverview {
  totalSpentCents: number;
  vipOrderCount: number;
  unlockedCount: number;
}

/** 消费中心数据：概览 + 订单分页 + 解锁记录分页。 */
export interface PurchaseData {
  overview: PurchaseOverview;
  orders: OrderDto[];
  ordersTotal: number;
  ordersPage: number;
  ordersPageSize: number;
  ordersTotalPages: number;
  unlocks: UnlockDto[];
  unlocksTotal: number;
  unlocksPage: number;
  unlocksPageSize: number;
  unlocksTotalPages: number;
}

/** 签到结果：`points` 本次获得积分，`totalPoints` 签到后的积分余额。 */
export interface CheckinResult {
  checkin: boolean;
  points: number;
  totalPoints: number;
  message: string;
}

/** 签到状态：`dailyPoints` 为当前配置的每日签到积分。 */
export interface CheckinStatus {
  checkedIn: boolean;
  dailyPoints: number;
}

/**
 * 创建会员订单结果。
 * `payment.mock` 为 true 表示本地模拟支付；`payUrl` 为支付宝收银台地址，
 * 模拟模式下可能为 `null`，由前端直接跳转成功页。
 */
export interface VipOrderResult {
  order: OrderDto;
  payment: {
    provider: 'alipay';
    mock: boolean;
    payUrl: string | null;
    message: string;
  };
}

/** 作者详情页数据：作者资料 + 作品分页。 */
export interface AuthorDetailDto {
  author: AuthorDto;
  albums: AlbumCardDto[];
  albumTotal: number;
  albumPage: number;
  albumPageSize: number;
  albumTotalPages: number;
}

/** 未读通知数。 */
export interface UnreadCount {
  unread: number;
}
