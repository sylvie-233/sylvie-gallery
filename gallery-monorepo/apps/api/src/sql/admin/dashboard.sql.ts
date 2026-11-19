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

export interface TodayRevenueRow {
  revenue: string | number;
  cnt: number;
}

export interface TodayUnlockRow {
  cnt: number;
  points: string | number;
}

export interface CountRow {
  cnt: number;
}

export interface PageViewRow {
  pv: number;
  uv: number;
}

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

export interface HotKeywordRow {
  keyword: string;
  cnt: number;
}

export interface TrendBucketRow {
  bucket: string;
  value: string | number;
}

export function selectTodayVipRevenue(): SqlStatement {
  return {
    sql: `SELECT COALESCE(SUM(amount_cents), 0) AS revenue, COUNT(*) AS cnt
         FROM pay_order
        WHERE status = 'paid' AND biz_type = 'vip' AND amount_cents > 0 AND DATE(paid_at) = CURDATE()`,
    params: [],
  };
}

export function selectTodayUnlocks(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS cnt, COALESCE(SUM(points_cost), 0) AS points
         FROM album_unlock WHERE DATE(created_at) = CURDATE()`,
    params: [],
  };
}

export function selectTodayNewUsers(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS cnt FROM \`user\`
        WHERE is_deleted = 0 AND role IN ('member','vip') AND DATE(created_at) = CURDATE()`,
    params: [],
  };
}

export function selectTodayPageViews(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS pv,
              COUNT(DISTINCT COALESCE(CAST(user_id AS CHAR), visitor_id, ip)) AS uv
         FROM user_view_log WHERE view_date = CURDATE()`,
    params: [],
  };
}

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

export function selectTodayOrderCount(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS cnt FROM pay_order WHERE DATE(created_at) = CURDATE()`,
    params: [],
  };
}

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
