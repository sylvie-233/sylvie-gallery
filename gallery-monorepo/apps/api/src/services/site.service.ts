/**
 * 站点聚合业务：友情链接、系统配置与首页一次性启动数据。
 * `getSiteBootstrap` 并发聚合多个前台域，供首页首屏一次拉取。
 */
import type { FriendLinkDto, SiteBootstrap } from '@sylvie/types';

import { dbClient } from '../db/index.js';
import {
  selectConfigMap,
  selectFriendLinks,
  selectSiteStats,
  type FriendLinkRow,
} from '../sql/site.sql.js';
import { listHomeAnnouncements } from './announcement.service.js';
import { listAlbums } from './album.service.js';
import { listAuthors } from './author.service.js';
import { listPlans } from './order.service.js';
import { listTags } from './tag.service.js';

/** 启用的友情链接列表，按后台排序权重升序。 */
export async function getFriendLinks(): Promise<FriendLinkDto[]> {
  const statement = selectFriendLinks();
  const rows = await dbClient.query<FriendLinkRow>(statement.sql, statement.params);
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    slogan: row.slogan,
    url: row.url,
  }));
}

/**
 * 全站配置键值映射；`config_value` 为 NULL 时统一转换为空字符串，
 * 调用方自行解析类型（水印开关、签到积分等）。
 */
export async function getConfigMap(): Promise<Record<string, string>> {
  const statement = selectConfigMap();
  const rows = await dbClient.query<{ key: string; value: string | null }>(
    statement.sql,
    statement.params,
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value ?? '';
  }
  return map;
}

/**
 * 首页一次性数据：配置、友链、套餐、标签、作者、最新图集、公告与统计。
 * 各域查询用 `Promise.all` 并发执行；`userId` 用于作者订阅状态与图集收藏状态，
 * 游客传 undefined。统计字段为 NULL 时统一兜底为 0 / null。
 */
export async function getSiteBootstrap(userId?: number): Promise<SiteBootstrap> {
  const [config, friendLinks, plans, tags, authors, latestAlbums, announcements, statsRow] =
    await Promise.all([
      getConfigMap(),
      getFriendLinks(),
      listPlans(),
      listTags(),
      listAuthors(undefined, userId),
      listAlbums({ page: 1, pageSize: 24, sort: 'new' }, userId),
      listHomeAnnouncements(4),
      (() => {
        const statement = selectSiteStats();
        return dbClient.queryOne<{
          albumCount: number;
          authorCount: number;
          imageCount: string | number;
          todayAdded: number;
          latestDate: string | null;
        }>(statement.sql, statement.params);
      })(),
    ]);

  return {
    config,
    friendLinks,
    plans,
    tags,
    authors,
    latestAlbums: latestAlbums.list,
    announcements,
    todayAdded: Number(statsRow?.todayAdded ?? 0),
    latestDate: statsRow?.latestDate ?? null,
    stats: {
      albumCount: Number(statsRow?.albumCount ?? 0),
      authorCount: Number(statsRow?.authorCount ?? 0),
      imageCount: Number(statsRow?.imageCount ?? 0),
    },
  };
}
