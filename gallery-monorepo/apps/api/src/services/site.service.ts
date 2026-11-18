import type { FriendLinkDto, SiteBootstrap } from '@sylvie/types';

import { dbClient } from '../db/index.js';
import { listHomeAnnouncements } from './announcement.service.js';
import { listAlbums } from './album.service.js';
import { listAuthors } from './author.service.js';
import { listPlans } from './order.service.js';
import { listTags } from './tag.service.js';

interface FriendLinkRow {
  id: number;
  name: string;
  slogan: string | null;
  url: string;
}

export async function getFriendLinks(): Promise<FriendLinkDto[]> {
  const rows = await dbClient.query<FriendLinkRow>(
    `SELECT id, name, slogan, url
       FROM friend_link
      WHERE status = 1
      ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    slogan: row.slogan,
    url: row.url,
  }));
}

export async function getConfigMap(): Promise<Record<string, string>> {
  const rows = await dbClient.query<{ key: string; value: string | null }>(
    `SELECT config_key AS \`key\`, config_value AS value FROM sys_config`,
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
      dbClient.queryOne<{
        albumCount: number;
        authorCount: number;
        imageCount: string | number;
        todayAdded: number;
        latestDate: string | null;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM album WHERE status = 'published' AND is_deleted = 0) AS albumCount,
           (SELECT COUNT(*) FROM author WHERE status = 1 AND is_deleted = 0) AS authorCount,
           (SELECT COALESCE(SUM(image_count), 0) FROM album WHERE status = 'published' AND is_deleted = 0) AS imageCount,
           (SELECT COUNT(*) FROM album WHERE status = 'published' AND is_deleted = 0 AND DATE(published_at) = CURDATE()) AS todayAdded,
           (SELECT MAX(DATE(published_at)) FROM album WHERE status = 'published' AND is_deleted = 0) AS latestDate`,
      ),
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
