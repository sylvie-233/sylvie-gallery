/**
 * 后台看板的参数化 SQL：今日经营指标、站点统计、最近图集、热搜词与营收趋势。
 *
 * 营收口径统一为「已支付且现金金额 > 0 的会员订单」；统计全部为只读查询。
 */
import type { SqlStatement } from '../shared.js';

/** 仪表盘最近图集行。 */
export interface RecentAlbumRow {
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
  isRecommended: number;
  status: 'draft' | 'published' | 'offline';
  publishedAt: string | null;
  createdAt: string;
}

/** 今日现金营收行：revenue 为金额（分），cnt 为订单数。 */
export interface TodayRevenueRow {
  revenue: string | number;
  cnt: number;
}

/** 今日解锁行：cnt 为解锁次数，points 为消耗积分合计。 */
export interface TodayUnlockRow {
  cnt: number;
  points: string | number;
}

/** 通用计数值行。 */
export interface CountRow {
  cnt: number;
}

/** 今日访问行：pv 为浏览量，uv 为按用户 / 访客 / IP 去重后的独立访客数。 */
export interface PageViewRow {
  pv: number;
  uv: number;
}

/** 站点统计行：图集各状态数量、用户 / VIP 总量与本月新增、待审评论数。 */
export interface SiteStatisticsRow {
  albumTotal: number;
  publishedAlbums: number;
  draftAlbums: number;
  offlineAlbums: number;
  userTotal: number;
  monthNewUsers: number;
  vipTotal: number;
  monthNewVip: number;
  pendingComments: number;
}

/** 热搜词行：关键词与出现次数。 */
export interface HotKeywordRow {
  keyword: string;
  cnt: number;
}

/** 营收趋势桶行：bucket 为日期或月份，value 为金额（分）。 */
export interface TrendBucketRow {
  bucket: string;
  value: string | number;
}

/** 今日现金营收与订单数：已支付、会员业务、金额 > 0，按 paid_at 归入今天。 */
export function selectTodayVipRevenue(): SqlStatement {
  return {
    sql: `SELECT COALESCE(SUM(amount_cents), 0) AS revenue, COUNT(*) AS cnt
         FROM pay_order
        WHERE status = 'paid' AND biz_type = 'vip' AND amount_cents > 0 AND DATE(paid_at) = CURDATE()`,
    params: [],
  };
}

/** 今日图集解锁次数与消耗积分合计（按 album_unlock.created_at 归入今天）。 */
export function selectTodayUnlocks(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS cnt, COALESCE(SUM(points_cost), 0) AS points
         FROM album_unlock WHERE DATE(created_at) = CURDATE()`,
    params: [],
  };
}

/** 今日新增普通用户数：member / vip、未删除、创建于今天。 */
export function selectTodayNewUsers(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS cnt FROM \`user\`
        WHERE is_deleted = 0 AND role IN ('member','vip') AND DATE(created_at) = CURDATE()`,
    params: [],
  };
}

/**
 * 今日访问量：pv 为记录条数；uv 按用户 ID 优先、否则访客 ID、再否则 IP 去重，
 * 因此未登录访客也能计入。只统计 view_date = 今天。
 */
export function selectTodayPageViews(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS pv,
              COUNT(DISTINCT COALESCE(CAST(user_id AS CHAR), visitor_id, ip)) AS uv
         FROM user_view_log WHERE view_date = CURDATE()`,
    params: [],
  };
}

/**
 * 站点总览统计（单行多子查询）：图集总量与各状态、非管理员用户总量与本月新增、
 * 当前有效 VIP 数、本月付费新增 VIP（按现金会员订单去重用户）、待审评论数。
 */
export function selectSiteStatistics(): SqlStatement {
  return {
    sql: `SELECT
         (SELECT COUNT(*) FROM album WHERE is_deleted = 0) AS albumTotal,
         (SELECT COUNT(*) FROM album WHERE is_deleted = 0 AND status = 'published') AS publishedAlbums,
         (SELECT COUNT(*) FROM album WHERE is_deleted = 0 AND status = 'draft') AS draftAlbums,
         (SELECT COUNT(*) FROM album WHERE is_deleted = 0 AND status = 'offline') AS offlineAlbums,
         (SELECT COUNT(*) FROM \`user\` WHERE is_deleted = 0 AND role <> 'admin') AS userTotal,
         (SELECT COUNT(*) FROM \`user\`
           WHERE is_deleted = 0 AND role <> 'admin'
             AND DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')) AS monthNewUsers,
         (SELECT COUNT(*) FROM \`user\`
           WHERE is_deleted = 0 AND role = 'vip' AND vip_expire_at > NOW()) AS vipTotal,
         (SELECT COUNT(DISTINCT user_id) FROM pay_order
           WHERE biz_type = 'vip' AND status = 'paid' AND amount_cents > 0
             AND DATE_FORMAT(paid_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')) AS monthNewVip,
         (SELECT COUNT(*) FROM comment WHERE status = 'pending' AND is_deleted = 0) AS pendingComments`,
    params: [],
  };
}

/** 今日新建订单数（不限业务与状态，按 created_at 归入今天）。 */
export function selectTodayOrderCount(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS cnt FROM pay_order WHERE DATE(created_at) = CURDATE()`,
    params: [],
  };
}

/** 看板最近图集：未删除、按创建时间倒序取 6 条，附带作者展示信息。 */
export function selectDashboardRecentAlbums(): SqlStatement {
  return {
    sql: `SELECT a.id, a.title, a.cover_url AS coverUrl, a.author_id AS authorId,
              au.name AS authorName, au.initial AS authorInitial, au.color AS authorColor,
              au.avatar_url AS authorAvatarUrl, a.image_count AS imageCount,
              a.video_count AS videoCount, a.points, a.view_count AS viewCount,
              a.fav_count AS favCount, a.is_recommended AS isRecommended, a.status,
              a.published_at AS publishedAt, a.created_at AS createdAt
         FROM album a JOIN author au ON au.id = a.author_id
        WHERE a.is_deleted = 0
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 6`,
    params: [],
  };
}

/** 近 7 天热搜词：按出现次数倒序取前 5，次数相同按关键词升序。 */
export function selectDashboardHotKeywords(): SqlStatement {
  return {
    sql: `SELECT keyword, COUNT(*) AS cnt
         FROM search_log
        WHERE search_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY keyword
        ORDER BY cnt DESC, keyword ASC
        LIMIT 5`,
    params: [],
  };
}

/**
 * 近 6 个月现金营收趋势（含当月）：按 paid_at 的 YYYY-MM 分桶求和。
 * 起点为 5 个月前的 1 号，区间外的月份不返回，由 service 补 0。
 */
export function selectMonthlyRevenueTrend(): SqlStatement {
  return {
    sql: `SELECT DATE_FORMAT(paid_at, '%Y-%m') AS bucket, SUM(amount_cents) AS value
         FROM pay_order
        WHERE status = 'paid' AND biz_type = 'vip' AND amount_cents > 0
          AND paid_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')
        GROUP BY bucket`,
    params: [],
  };
}

/**
 * 按天现金营收趋势：从 offsetDays 天前到今天（不含明天）按 paid_at 的日期分桶。
 * offsetDays 由调用方按 7d / 30d 传入（天数 - 1）。
 */
export function selectDailyRevenueTrend(offsetDays: number): SqlStatement {
  return {
    sql: `SELECT DATE(paid_at) AS bucket, SUM(amount_cents) AS value
       FROM pay_order
      WHERE status = 'paid' AND biz_type = 'vip' AND amount_cents > 0
        AND paid_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND paid_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      GROUP BY bucket`,
    params: [offsetDays],
  };
}
