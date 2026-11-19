import type { AnnouncementType } from '@sylvie/types';

import { placeholders, type SqlFragment, type SqlStatement } from './shared.js';

/**
 * 前台公告 SQL：列表筛选、首页精选与搜索日志。
 * 公告只读取启用且未软删除的数据，列表置顶优先。
 */

/** 公告行。 */
export interface AnnouncementRow {
  id: number;
  type: AnnouncementType;
  title: string;
  summary: string | null;
  content: string | null;
  isTop: number;
  publishedAt: string;
}

const ANNOUNCEMENT_COLUMNS = `id, type, title, summary, content, is_top AS isTop, published_at AS publishedAt`;

/**
 * 公告列表动态 WHERE：基础条件为启用且未软删除。
 * - `keyword` 非空时，标题 / 摘要 / 正文任一 LIKE 命中，或公告类型命中
 *   `matchedTypes`（由 service 根据类型中文标签反查得到）；
 * - `matchedTypes` 仅在有关键词时参与，空数组则只做文本匹配。
 */
export function announcementListFilter(
  keyword: string,
  matchedTypes: string[],
): SqlFragment {
  const conditions = ['status = 1', 'is_deleted = 0'];
  const params: unknown[] = [];

  if (keyword) {
    const like = `%${keyword}%`;
    const ors = ['title LIKE ?', 'summary LIKE ?', 'content LIKE ?'];
    params.push(like, like, like);
    if (matchedTypes.length > 0) {
      ors.push(`type IN (${placeholders(matchedTypes.length)})`);
      params.push(...matchedTypes);
    }
    conditions.push(`(${ors.join(' OR ')})`);
  }

  return { sql: conditions.join(' AND '), params };
}

/**
 * 统计符合筛选条件的公告总数（分页 total）。
 * `where` 由 `announcementListFilter` 生成，参数原样透传。
 */
export function countAnnouncements(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM announcement WHERE ${where.sql}`,
    params: where.params,
  };
}

/**
 * 公告分页列表。
 * `where` 为筛选条件；返回按「置顶 → 发布时间 → id」倒序，
 * `pageSize` / `offset` 由 service 归一化后传入。
 */
export function selectAnnouncementsPage(
  where: SqlFragment,
  pageSize: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT ${ANNOUNCEMENT_COLUMNS}
       FROM announcement
      WHERE ${where.sql}
      ORDER BY is_top DESC, published_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    params: [...where.params, pageSize, offset],
  };
}

/** 首页公告：最新 `limit` 条，置顶优先、发布时间倒序。 */
export function selectHomeAnnouncements(limit: number): SqlStatement {
  return {
    sql: `SELECT ${ANNOUNCEMENT_COLUMNS}
       FROM announcement
      WHERE status = 1 AND is_deleted = 0
      ORDER BY is_top DESC, published_at DESC, id DESC
      LIMIT ?`,
    params: [limit],
  };
}

/**
 * 记录公告搜索日志。
 * `userId` 为 undefined（游客）时写 NULL；`resultCount` 为本次命中总数。
 */
export function insertAnnouncementSearchLog(
  keyword: string,
  userId: number | undefined,
  resultCount: number,
): SqlStatement {
  return {
    sql: `INSERT INTO search_log (scene, keyword, user_id, result_count, search_date)
       VALUES ('announcement', ?, ?, ?, CURDATE())`,
    params: [keyword, userId ?? null, resultCount],
  };
}
