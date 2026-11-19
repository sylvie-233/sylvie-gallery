import type { SqlStatement } from './shared.js';

/** 友情链接行。 */
export interface FriendLinkRow {
  id: number;
  name: string;
  slogan: string | null;
  url: string;
}

/** 启用的友情链接。 */
export function selectFriendLinks(): SqlStatement {
  return {
    sql: `SELECT id, name, slogan, url
       FROM friend_link
      WHERE status = 1
      ORDER BY sort_order ASC, id ASC`,
    params: [],
  };
}

/** 全站配置键值。 */
export function selectConfigMap(): SqlStatement {
  return {
    sql: `SELECT config_key AS \`key\`, config_value AS value FROM sys_config`,
    params: [],
  };
}

/** 首页统计：图集 / 作者 / 媒体数量与今日新增。 */
export function selectSiteStats(): SqlStatement {
  return {
    sql: `SELECT
           (SELECT COUNT(*) FROM album WHERE status = 'published' AND is_deleted = 0) AS albumCount,
           (SELECT COUNT(*) FROM author WHERE status = 1 AND is_deleted = 0) AS authorCount,
           (SELECT COALESCE(SUM(image_count), 0) FROM album WHERE status = 'published' AND is_deleted = 0) AS imageCount,
           (SELECT COUNT(*) FROM album WHERE status = 'published' AND is_deleted = 0 AND DATE(published_at) = CURDATE()) AS todayAdded,
           (SELECT MAX(DATE(published_at)) FROM album WHERE status = 'published' AND is_deleted = 0) AS latestDate`,
    params: [],
  };
}
