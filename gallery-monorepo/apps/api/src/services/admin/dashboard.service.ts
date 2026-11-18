import type {
  AdminAlbumRow,
  AdminDashboard,
  AdminTrend,
  TrendMode,
  TrendPoint,
} from '@sylvie/types';

import { dbClient } from '../../db/index.js';
import { toBool, toNumber } from '../../utils/format.js';

interface RecentAlbumRow {
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

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function mapRecentAlbum(row: RecentAlbumRow): AdminAlbumRow {
  return {
    id: Number(row.id),
    title: row.title,
    coverUrl: row.coverUrl,
    authorId: Number(row.authorId),
    authorName: row.authorName,
    authorInitial: row.authorInitial,
    authorColor: row.authorColor,
    authorAvatarUrl: row.authorAvatarUrl,
    imageCount: Number(row.imageCount),
    videoCount: Number(row.videoCount),
    points: Number(row.points),
    viewCount: Number(row.viewCount),
    favCount: Number(row.favCount),
    isRecommended: toBool(row.isRecommended),
    status: row.status,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
  };
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const [
    todayRow,
    unlockRow,
    newUserRow,
    pvRow,
    siteRow,
    todayOrderRow,
    recentRows,
    hotRows,
  ] = await Promise.all([
    dbClient.queryOne<{ revenue: string | number; cnt: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS revenue, COUNT(*) AS cnt
         FROM pay_order
        WHERE status = 'paid' AND biz_type = 'vip' AND amount_cents > 0 AND DATE(paid_at) = CURDATE()`,
    ),
    dbClient.queryOne<{ cnt: number; points: string | number }>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(points_cost), 0) AS points
         FROM album_unlock WHERE DATE(created_at) = CURDATE()`,
    ),
    dbClient.queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM \`user\`
        WHERE is_deleted = 0 AND role IN ('member','vip') AND DATE(created_at) = CURDATE()`,
    ),
    dbClient.queryOne<{ pv: number; uv: number }>(
      `SELECT COUNT(*) AS pv,
              COUNT(DISTINCT COALESCE(CAST(user_id AS CHAR), visitor_id, ip)) AS uv
         FROM user_view_log WHERE view_date = CURDATE()`,
    ),
    dbClient.queryOne<{
      albumTotal: number;
      publishedAlbums: number;
      draftAlbums: number;
      offlineAlbums: number;
      userTotal: number;
      monthNewUsers: number;
      vipTotal: number;
      monthNewVip: number;
      pendingComments: number;
    }>(
      `SELECT
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
    ),
    dbClient.queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM pay_order WHERE DATE(created_at) = CURDATE()`,
    ),
    dbClient.query<RecentAlbumRow>(
      `SELECT a.id, a.title, a.cover_url AS coverUrl, a.author_id AS authorId,
              au.name AS authorName, au.initial AS authorInitial, au.color AS authorColor,
              au.avatar_url AS authorAvatarUrl, a.image_count AS imageCount,
              a.video_count AS videoCount, a.points, a.view_count AS viewCount,
              a.fav_count AS favCount, a.is_recommended AS isRecommended, a.status,
              a.published_at AS publishedAt, a.created_at AS createdAt
         FROM album a JOIN author au ON au.id = a.author_id
        WHERE a.is_deleted = 0
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 6`,
    ),
    dbClient.query<{ keyword: string; cnt: number }>(
      `SELECT keyword, COUNT(*) AS cnt
         FROM search_log
        WHERE search_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY keyword
        ORDER BY cnt DESC, keyword ASC
        LIMIT 5`,
    ),
  ]);

  const pendingComments = Number(siteRow?.pendingComments ?? 0);

  return {
    date: dateString(new Date()),
    today: {
      revenueCents: toNumber(todayRow?.revenue),
      orderCount: Number(todayRow?.cnt ?? 0),
      unlockCount: Number(unlockRow?.cnt ?? 0),
      unlockPoints: toNumber(unlockRow?.points),
      newUsers: Number(newUserRow?.cnt ?? 0),
      pv: Number(pvRow?.pv ?? 0),
      uv: Number(pvRow?.uv ?? 0),
    },
    site: {
      albumTotal: Number(siteRow?.albumTotal ?? 0),
      publishedAlbums: Number(siteRow?.publishedAlbums ?? 0),
      draftAlbums: Number(siteRow?.draftAlbums ?? 0),
      offlineAlbums: Number(siteRow?.offlineAlbums ?? 0),
      userTotal: Number(siteRow?.userTotal ?? 0),
      monthNewUsers: Number(siteRow?.monthNewUsers ?? 0),
      vipTotal: Number(siteRow?.vipTotal ?? 0),
      monthNewVip: Number(siteRow?.monthNewVip ?? 0),
      pendingComments,
    },
    todos: {
      pendingComments,
      draftAlbums: Number(siteRow?.draftAlbums ?? 0),
      offlineAlbums: Number(siteRow?.offlineAlbums ?? 0),
      todayOrders: Number(todayOrderRow?.cnt ?? 0),
    },
    recentAlbums: recentRows.map(mapRecentAlbum),
    hotKeywords: hotRows.map((row) => ({ keyword: row.keyword, count: Number(row.cnt) })),
  };
}

/** 营收趋势：只统计已支付的现金会员订单，与支付流水页同口径。 */
export async function getAdminTrend(mode: TrendMode): Promise<AdminTrend> {
  if (mode === '6m') {
    const now = new Date();
    const months: Array<{ key: string; label: string }> = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      months.push({
        key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`,
        label: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`,
      });
    }
    const rows = await dbClient.query<{ bucket: string; value: string | number }>(
      `SELECT DATE_FORMAT(paid_at, '%Y-%m') AS bucket, SUM(amount_cents) AS value
         FROM pay_order
        WHERE status = 'paid' AND biz_type = 'vip' AND amount_cents > 0
          AND paid_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')
        GROUP BY bucket`,
    );
    const map = new Map(rows.map((row) => [row.bucket, toNumber(row.value)]));
    const points: TrendPoint[] = months.map((month) => ({
      label: month.label,
      date: month.key,
      valueCents: map.get(month.key) ?? 0,
    }));
    return summarizeTrend(mode, points);
  }

  const days = mode === '30d' ? 30 : 7;
  const now = new Date();
  const dates: Array<{ key: string; label: string }> = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    dates.push({
      key: dateString(date),
      label: `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    });
  }
  const rows = await dbClient.query<{ bucket: string; value: string | number }>(
    `SELECT DATE(paid_at) AS bucket, SUM(amount_cents) AS value
       FROM pay_order
      WHERE status = 'paid' AND biz_type = 'vip' AND amount_cents > 0
        AND paid_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND paid_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      GROUP BY bucket`,
    [days - 1],
  );
  const map = new Map(
    rows.map((row) => [String(row.bucket), toNumber(row.value)]),
  );
  const points: TrendPoint[] = dates.map((day) => ({
    label: day.label,
    date: day.key,
    valueCents: map.get(day.key) ?? 0,
  }));
  return summarizeTrend(mode, points);
}

function summarizeTrend(mode: TrendMode, points: TrendPoint[]): AdminTrend {
  const sumCents = points.reduce((sum, point) => sum + point.valueCents, 0);
  const maxPoint = points.reduce(
    (best, point) => (point.valueCents > best.valueCents ? point : best),
    points[0] ?? { label: '—', date: '', valueCents: 0 },
  );
  return {
    mode,
    points,
    sumCents,
    avgCents: points.length > 0 ? Math.round(sumCents / points.length) : 0,
    maxCents: maxPoint.valueCents,
    maxLabel: maxPoint.label,
  };
}
