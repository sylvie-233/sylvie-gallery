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

export interface AuthResult {
  token: string;
  tokenType: 'Bearer';
  expiresIn: number;
  profile: UserProfile;
}

export interface TagDto {
  id: number;
  name: string;
  useCount: number;
}

export interface AlbumAuthorDto {
  id: number;
  name: string;
  initial: string;
  color: string;
  avatarUrl: string | null;
}

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

export interface CommentUserDto {
  id: number;
  nickname: string;
  avatarType: number;
  avatarIndex: number;
  avatarUrl: string | null;
  role: EffectiveRole;
}

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

export interface AlbumListQuery {
  page?: number;
  pageSize?: number;
  sort?: SortType;
  tag?: string;
  keyword?: string;
  authorId?: number;
}

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

export interface NotificationAlbumDto {
  id: number;
  title: string;
  coverUrl: string;
  imageCount: number;
  videoCount: number;
  authorName: string;
  publishedAt: string;
}

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

export interface MembershipPlanDto {
  id: number;
  code: string;
  name: string;
  priceCents: number;
  durationDays: number;
  benefits: string[];
  status: number;
}

export interface FriendLinkDto {
  id: number;
  name: string;
  slogan: string | null;
  url: string;
}

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

export interface UnlockDto {
  id: number;
  album: AlbumCardDto;
  pointsCost: number;
  createdAt: string;
}

export interface PurchaseOverview {
  totalSpentCents: number;
  vipOrderCount: number;
  unlockedCount: number;
}

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

export interface CheckinResult {
  checkin: boolean;
  points: number;
  totalPoints: number;
  message: string;
}

export interface CheckinStatus {
  checkedIn: boolean;
  dailyPoints: number;
}

export interface VipOrderResult {
  order: OrderDto;
  payment: {
    provider: 'alipay';
    mock: boolean;
    payUrl: string | null;
    message: string;
  };
}

export interface AuthorDetailDto {
  author: AuthorDto;
  albums: AlbumCardDto[];
  albumTotal: number;
  albumPage: number;
  albumPageSize: number;
  albumTotalPages: number;
}

export interface UnreadCount {
  unread: number;
}
