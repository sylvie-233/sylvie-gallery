/**
 * 后台数据看板：今日经营指标、站点统计、待办、最近图集、热搜词与营收趋势。
 *
 * 营收类指标统一只统计「已支付、现金金额 > 0 的会员订单」，不含积分订单与 0 元赠送单。
 * 所有查询均为只读，可并发执行。
 */
import type {
  AdminAlbumRow,
  AdminDashboard,
  AdminTrend,
  TrendMode,
  TrendPoint,
} from '@sylvie/types';

import { dbClient } from '../../db/index.js';
import { toBool, toNumber } from '../../utils/format.js';
import {
  selectDailyRevenueTrend,
  selectDashboardHotKeywords,
  selectDashboardRecentAlbums,
  selectMonthlyRevenueTrend,
  selectSiteStatistics,
  selectTodayNewUsers,
  selectTodayOrderCount,
  selectTodayPageViews,
  selectTodayUnlocks,
  selectTodayVipRevenue,
  type CountRow,
  type HotKeywordRow,
  type PageViewRow,
  type RecentAlbumRow,
  type SiteStatisticsRow,
  type TodayRevenueRow,
  type TodayUnlockRow,
  type TrendBucketRow,
} from '../../sql/admin/dashboard.sql.js';

/** 两位数补零，用于拼接日期字符串。 */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 将 Date 格式化为本地时区的 YYYY-MM-DD。 */
function dateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 将看板最近图集行映射为通用图集行，数字 / 布尔字段统一转换。 */
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

/**
 * 汇总后台首页看板数据。
 *
 * 8 条统计查询并发执行：今日现金营收 / 解锁、今日新增用户 / 访问、站点总量、
 * 今日订单数、最近 6 套图集、近 7 天热搜词。待审评论数同时用于站点统计与待办。
 */
export async function getAdminDashboard(): Promise<AdminDashboard> {
  const todayStatement = selectTodayVipRevenue();
  const unlockStatement = selectTodayUnlocks();
  const newUserStatement = selectTodayNewUsers();
  const pvStatement = selectTodayPageViews();
  const siteStatement = selectSiteStatistics();
  const todayOrderStatement = selectTodayOrderCount();
  const recentStatement = selectDashboardRecentAlbums();
  const hotStatement = selectDashboardHotKeywords();

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
    dbClient.queryOne<TodayRevenueRow>(todayStatement.sql, todayStatement.params),
    dbClient.queryOne<TodayUnlockRow>(unlockStatement.sql, unlockStatement.params),
    dbClient.queryOne<CountRow>(newUserStatement.sql, newUserStatement.params),
    dbClient.queryOne<PageViewRow>(pvStatement.sql, pvStatement.params),
    dbClient.queryOne<SiteStatisticsRow>(siteStatement.sql, siteStatement.params),
    dbClient.queryOne<CountRow>(todayOrderStatement.sql, todayOrderStatement.params),
    dbClient.query<RecentAlbumRow>(recentStatement.sql, recentStatement.params),
    dbClient.query<HotKeywordRow>(hotStatement.sql, hotStatement.params),
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

/**
 * 营收趋势：只统计已支付、现金金额 > 0 的会员订单，与支付流水页同口径。
 *
 * @param mode '7d' / '30d' 按天分桶（含今天），'6m' 按月分桶（含当月）；
 * 数据库缺失的日期 / 月份补 0，保证前端横轴连续。
 */
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
    const statement = selectMonthlyRevenueTrend();
    const rows = await dbClient.query<TrendBucketRow>(statement.sql, statement.params);
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
  const statement = selectDailyRevenueTrend(days - 1);
  const rows = await dbClient.query<TrendBucketRow>(statement.sql, statement.params);
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

/** 汇总趋势点：总额、均值（四舍五入到分）与峰值所在标签；空序列兜底为空点。 */
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
