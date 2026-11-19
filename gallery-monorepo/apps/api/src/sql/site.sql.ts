import type { SqlStatement } from './shared.js';

/**
 * 站点级 SQL：友情链接、系统配置与首页统计。
 * 统计口径只计入已发布且未软删除的图集、启用且未软删除的作者。
 */

/** 友情链接行。 */
export interface FriendLinkRow {
  id: number;
  name: string;
  slogan: string | null;
  url: string;
}

/**
 * 启用的友情链接（`status = 1`）。
 * 无参数；按后台排序权重升序、id 升序。
 */
export function selectFriendLinks(): SqlStatement {
  return {
    sql: `SELECT id, name, slogan, url
       FROM friend_link
      WHERE status = 1
      ORDER BY sort_order ASC, id ASC`,
    params: [],
  };
}

/**
 * 全站配置键值对（`sys_config` 全表）。
 * 无参数；由 service 组装为 `Record<string, string>`，调用方按需读取水印 / 签到等开关。
 */
export function selectConfigMap(): SqlStatement {
  return {
    sql: `SELECT config_key AS \`key\`, config_value AS value FROM sys_config`,
    params: [],
  };
}

/**
 * 首页统计：图集数、作者数、媒体总数、今日新增与最近发布日期。
 * 无参数；一次性子查询返回单行，`imageCount` 用 `SUM(image_count)` 并
 * `COALESCE(..., 0)` 兜底无图集时返回 0，`todayAdded` 按 `published_at` 日期比较。
 */
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
