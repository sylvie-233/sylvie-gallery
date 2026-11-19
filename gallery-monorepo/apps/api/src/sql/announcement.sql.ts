import type { AnnouncementType } from '@sylvie/types';

import { placeholders, type SqlFragment, type SqlStatement } from './shared.js';

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

/** 公告列表动态 WHERE：关键词与类型标签匹配。 */
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

export function countAnnouncements(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM announcement WHERE ${where.sql}`,
    params: where.params,
  };
}

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

/** 首页公告：最新若干条，置顶优先。 */
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

/** 记录公告搜索日志。 */
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
