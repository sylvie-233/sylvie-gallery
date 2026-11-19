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

/** 首页一次性数据：配置、友链、套餐、标签、作者、最新图集、公告与统计。 */
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
