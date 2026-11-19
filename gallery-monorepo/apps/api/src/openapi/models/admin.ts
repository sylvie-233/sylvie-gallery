/**
 * 管理后台响应模型：图集、标签、作者、评论、公告、订单、用户、配置、日志、
 * 看板趋势、上传结果与 Agent 令牌。金额字段一律以「分」为单位。
 */
import { z } from '@hono/zod-openapi';

import { TagDtoSchema } from './album.js';
import {
  albumStatusSchema,
  announcementTypeSchema,
  commentStatusSchema,
  orderStatusSchema,
  pageResult,
  payTypeSchema,
  roleSchema,
} from './common.js';
import { UserProfileSchema } from './user.js';

/** 管理后台登录返回的资料与前台一致。 */
export const AdminProfileSchema = UserProfileSchema;

/** 后台图集行。 */
export const AdminAlbumRowSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    coverUrl: z.string(),
    authorId: z.number().int(),
    authorName: z.string(),
    authorInitial: z.string(),
    authorColor: z.string(),
    authorAvatarUrl: z.string().nullable(),
    imageCount: z.number().int(),
    videoCount: z.number().int(),
    points: z.number().int(),
    viewCount: z.number().int(),
    favCount: z.number().int(),
    isRecommended: z.boolean(),
    status: albumStatusSchema,
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('AdminAlbumRow');

/** 后台图集媒体。 */
export const AdminMediaSchema = z
  .object({
    id: z.number().int().optional(),
    url: z.string(),
    thumbUrl: z.string().nullable().optional(),
    watermarkUrl: z.string().nullable().optional(),
    width: z.number().int().nullable().optional(),
    height: z.number().int().nullable().optional(),
    duration: z.number().int().nullable().optional(),
    size: z.number().optional(),
    filename: z.string().optional(),
  })
  .openapi('AdminMedia');

/** 后台图集详情。 */
export const AdminAlbumDetailSchema = AdminAlbumRowSchema.extend({
  description: z.string().nullable(),
  tags: z.array(TagDtoSchema),
  images: z.array(AdminMediaSchema),
  videos: z.array(AdminMediaSchema),
}).openapi('AdminAlbumDetail');

/** 后台图集分页。 */
export const AdminAlbumPageSchema = pageResult(AdminAlbumRowSchema).openapi('AdminAlbumPage');

/** 推荐切换结果。 */
export const AdminRecommendResultSchema = z
  .object({ isRecommended: z.boolean() })
  .openapi('AdminRecommendResult');

/** 后台标签行。 */
export const AdminTagRowSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    useCount: z.number().int(),
    status: z.number().int(),
    createdAt: z.string(),
  })
  .openapi('AdminTagRow');

/** 后台标签分页。 */
export const AdminTagPageSchema = pageResult(AdminTagRowSchema).openapi('AdminTagPage');

/** 后台作者行。 */
export const AdminAuthorRowSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    alias: z.string().nullable(),
    initial: z.string(),
    color: z.string(),
    avatarUrl: z.string().nullable(),
    coverUrl: z.string().nullable(),
    bio: z.string().nullable(),
    styleTags: z.array(z.string()),
    sortWeight: z.number().int(),
    status: z.number().int(),
    albumCount: z.number().int(),
    lastUpdateAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('AdminAuthorRow');

/** 后台作者分页。 */
export const AdminAuthorPageSchema = pageResult(AdminAuthorRowSchema).openapi('AdminAuthorPage');

/** 后台评论用户。 */
export const AdminCommentUserSchema = z
  .object({
    id: z.number().int(),
    nickname: z.string(),
    avatarType: z.number().int(),
    avatarIndex: z.number().int(),
    avatarUrl: z.string().nullable(),
    role: roleSchema,
  })
  .openapi('AdminCommentUser');

/** 后台评论行。 */
export const AdminCommentRowSchema = z
  .object({
    id: z.number().int(),
    albumId: z.number().int(),
    albumTitle: z.string(),
    parentId: z.number().int().nullable(),
    replyToName: z.string().nullable(),
    content: z.string(),
    status: commentStatusSchema,
    createdAt: z.string(),
    user: AdminCommentUserSchema,
  })
  .openapi('AdminCommentRow');

/** 后台评论分页。 */
export const AdminCommentPageSchema = pageResult(AdminCommentRowSchema).openapi('AdminCommentPage');

/** 后台公告行。 */
export const AdminAnnouncementRowSchema = z
  .object({
    id: z.number().int(),
    type: announcementTypeSchema,
    typeLabel: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    content: z.string().nullable(),
    isTop: z.boolean(),
    status: z.number().int(),
    publishedAt: z.string(),
    createdAt: z.string(),
  })
  .openapi('AdminAnnouncementRow');

/** 后台公告分页。 */
export const AdminAnnouncementPageSchema = pageResult(AdminAnnouncementRowSchema).openapi(
  'AdminAnnouncementPage',
);

/** 后台订单用户。 */
export const AdminOrderUserSchema = z
  .object({
    id: z.number().int(),
    nickname: z.string(),
    email: z.string(),
  })
  .openapi('AdminOrderUser');

/** 后台订单行。 */
export const AdminOrderRowSchema = z
  .object({
    id: z.number().int(),
    orderNo: z.string(),
    user: AdminOrderUserSchema,
    bizType: z.enum(['vip', 'unlock']),
    payType: payTypeSchema,
    // 实付金额（分）；赠送会员订单为 0。
    amountCents: z.number().int(),
    pointsCost: z.number().int(),
    vipDays: z.number().int(),
    status: orderStatusSchema,
    planName: z.string().nullable(),
    albumTitle: z.string().nullable(),
    tradeNo: z.string().nullable(),
    paidAt: z.string().nullable(),
    refundAt: z.string().nullable(),
    refundReason: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('AdminOrderRow');

/** 后台支付汇总。 */
export const AdminPaymentSummarySchema = z
  .object({
    // 金额单位均为「分」：累计收入、今日收入、会员现金收入。
    totalRevenueCents: z.number().int(),
    todayRevenueCents: z.number().int(),
    todayOrderCount: z.number().int(),
    vipOrderCount: z.number().int(),
    vipCashCents: z.number().int(),
    unlockCount: z.number().int(),
    // 积分解锁消耗的积分总量。
    unlockPoints: z.number().int(),
  })
  .openapi('AdminPaymentSummary');

/** 后台订单分页（附带汇总）。 */
export const AdminOrderPageSchema = pageResult(AdminOrderRowSchema)
  .extend({ summary: AdminPaymentSummarySchema })
  .openapi('AdminOrderPage');

/** 订单导出结果。 */
export const AdminOrderExportSchema = z
  .object({
    filename: z.string().nullable(),
    count: z.number().int(),
  })
  .openapi('AdminOrderExport');

/** 后台用户行。 */
export const AdminUserRowSchema = z
  .object({
    id: z.number().int(),
    nickname: z.string(),
    email: z.string(),
    role: roleSchema,
    points: z.number().int(),
    vipExpireAt: z.string().nullable(),
    // 账号状态：1=正常，0=封禁。
    status: z.number().int(),
    emailVerified: z.boolean(),
    createdAt: z.string(),
  })
  .openapi('AdminUserRow');

/** 后台用户分页（附带全部用户数）。 */
export const AdminUserPageSchema = pageResult(AdminUserRowSchema)
  .extend({ totalAll: z.number().int() })
  .openapi('AdminUserPage');

/** 重置密码结果。 */
export const AdminResetPasswordResultSchema = z
  .object({
    password: z.string(),
    user: AdminUserRowSchema,
  })
  .openapi('AdminResetPasswordResult');

/** 站点配置。 */
export const AdminSiteConfigSchema = z
  .object({
    copyright: z.string(),
    icpNo: z.string(),
    ageStatement: z.string(),
    disclaimer: z.string(),
    checkinPoints: z.number().int(),
    watermarkOn: z.boolean(),
  })
  .openapi('AdminSiteConfig');

/** 会员套餐配置。 */
export const AdminPlanConfigSchema = z
  .object({
    id: z.number().int(),
    code: z.string(),
    name: z.string(),
    // 价格单位：分；durationDays 为叠加的会员天数。
    priceCents: z.number().int(),
    durationDays: z.number().int(),
    benefits: z.array(z.string()),
    status: z.number().int(),
  })
  .openapi('AdminPlanConfig');

/** 友情链接行。 */
export const AdminFriendLinkRowSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    slogan: z.string().nullable(),
    url: z.string(),
    sortOrder: z.number().int(),
  })
  .openapi('AdminFriendLinkRow');

/** 后台配置聚合。 */
export const AdminConfigBundleSchema = z
  .object({
    site: AdminSiteConfigSchema,
    plan: AdminPlanConfigSchema,
    friendLinks: z.array(AdminFriendLinkRowSchema),
  })
  .openapi('AdminConfigBundle');

/** 操作日志行。 */
export const AdminLogRowSchema = z
  .object({
    id: z.number().int(),
    adminId: z.number().int(),
    adminName: z.string(),
    action: z.string(),
    actionLabel: z.string(),
    targetType: z.string().nullable(),
    targetId: z.number().int().nullable(),
    detail: z.string().nullable(),
    ip: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('AdminLogRow');

/** 操作日志分页。 */
export const AdminLogPageSchema = pageResult(AdminLogRowSchema).openapi('AdminLogPage');

/** 工作台看板。 */
export const AdminDashboardSchema = z
  .object({
    // date 为统计日期（北京时间）；today 为今日实时指标，site 为全站存量指标。
    date: z.string(),
    today: z.object({
      revenueCents: z.number().int(),
      orderCount: z.number().int(),
      unlockCount: z.number().int(),
      unlockPoints: z.number().int(),
      newUsers: z.number().int(),
      pv: z.number().int(),
      uv: z.number().int(),
    }),
    site: z.object({
      albumTotal: z.number().int(),
      publishedAlbums: z.number().int(),
      draftAlbums: z.number().int(),
      offlineAlbums: z.number().int(),
      userTotal: z.number().int(),
      monthNewUsers: z.number().int(),
      vipTotal: z.number().int(),
      monthNewVip: z.number().int(),
      pendingComments: z.number().int(),
    }),
    todos: z.object({
      pendingComments: z.number().int(),
      draftAlbums: z.number().int(),
      offlineAlbums: z.number().int(),
      todayOrders: z.number().int(),
    }),
    recentAlbums: z.array(AdminAlbumRowSchema),
    hotKeywords: z.array(z.object({ keyword: z.string(), count: z.number().int() })),
  })
  .openapi('AdminDashboard');

/** 趋势点。 */
export const TrendPointSchema = z
  .object({
    label: z.string(),
    date: z.string(),
    valueCents: z.number().int(),
  })
  .openapi('TrendPoint');

/** 趋势结果。 */
export const AdminTrendSchema = z
  .object({
    // 时间范围：近 7 天 / 近 30 天 / 近 6 个月；金额单位均为分。
    mode: z.enum(['7d', '30d', '6m']),
    points: z.array(TrendPointSchema),
    sumCents: z.number().int(),
    avgCents: z.number().int(),
    maxCents: z.number().int(),
    maxLabel: z.string(),
  })
  .openapi('AdminTrend');

/** 上传结果。 */
export const AdminUploadResultSchema = z
  .object({
    url: z.string(),
    key: z.string(),
    mediaType: z.enum(['image', 'video']),
    size: z.number(),
    contentType: z.string(),
    filename: z.string(),
    thumbUrl: z.string().nullable().optional(),
    watermarkUrl: z.string().nullable().optional(),
    width: z.number().int().nullable().optional(),
    height: z.number().int().nullable().optional(),
  })
  .openapi('AdminUploadResult');

/** Agent 令牌行（不含明文）。 */
export const AdminAgentTokenRowSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    // 只展示前缀，明文令牌不落库、仅在创建时返回一次。
    tokenPrefix: z.string(),
    // read=只读工具，write=可调用写工具（还需 MCP_ALLOW_WRITE=true）。
    scope: z.enum(['read', 'write']),
    status: z.number().int(),
    adminId: z.number().int(),
    adminName: z.string(),
    lastUsedAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('AdminAgentTokenRow');

/** 创建令牌结果：token 仅此一次返回。 */
export const AdminAgentTokenCreateResultSchema = z
  .object({
    token: z.string().openapi({ description: '明文令牌，仅创建时返回一次' }),
    item: AdminAgentTokenRowSchema,
  })
  .openapi('AdminAgentTokenCreateResult');
