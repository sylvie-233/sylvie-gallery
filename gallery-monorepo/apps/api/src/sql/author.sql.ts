import type { SqlStatement } from './shared.js';

/** 作者行：列表 / 详情共用。 */
export interface AuthorRow {
  id: number;
  name: string;
  alias: string | null;
  initial: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  color: string;
  bio: string | null;
  styleTags: string | null;
  albumCount: number;
  lastUpdateAt: string | null;
  sortWeight: number;
}

const AUTHOR_COLUMNS = `a.id, a.name, a.alias, a.initial, a.avatar_url AS avatarUrl,
  COALESCE(a.cover_url, (SELECT al.cover_url FROM album al
    WHERE al.author_id = a.id AND al.status = 'published' AND al.is_deleted = 0
    ORDER BY al.published_at DESC, al.id DESC LIMIT 1)) AS coverUrl,
  a.color, a.bio, a.style_tags AS styleTags, a.album_count AS albumCount,
  a.last_update_at AS lastUpdateAt, a.sort_weight AS sortWeight`;

/** 当前用户订阅的作者 ID。 */
export function selectSubscribedAuthorIds(userId: number): SqlStatement {
  return {
    sql: `SELECT author_id AS authorId FROM subscription WHERE user_id = ?`,
    params: [userId],
  };
}

/** 作者列表：支持姓名 / 别名 / 风格标签搜索。 */
export function selectAuthors(term: string): SqlStatement {
  const params: unknown[] = [];
  let search = '';
  if (term) {
    const like = `%${term}%`;
    search = 'AND (a.name LIKE ? OR a.alias LIKE ? OR a.style_tags LIKE ?)';
    params.push(like, like, like);
  }

  return {
    sql: `SELECT ${AUTHOR_COLUMNS}
       FROM author a
      WHERE a.status = 1 AND a.is_deleted = 0 ${search}
      ORDER BY a.sort_weight DESC, a.album_count DESC, a.id ASC`,
    params,
  };
}

/** 作者详情。 */
export function selectAuthorById(authorId: number): SqlStatement {
  return {
    sql: `SELECT ${AUTHOR_COLUMNS}
       FROM author a
      WHERE a.id = ? AND a.status = 1 AND a.is_deleted = 0
      LIMIT 1`,
    params: [authorId],
  };
}

/** 已订阅作者总数。 */
export function countSubscribedAuthors(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total
       FROM subscription s JOIN author a ON a.id = s.author_id
      WHERE s.user_id = ? AND a.status = 1 AND a.is_deleted = 0`,
    params: [userId],
  };
}

/** 已订阅作者分页。 */
export function selectSubscribedAuthors(
  userId: number,
  pageSize: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT ${AUTHOR_COLUMNS}
       FROM subscription s JOIN author a ON a.id = s.author_id
      WHERE s.user_id = ? AND a.status = 1 AND a.is_deleted = 0
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ? OFFSET ?`,
    params: [userId, pageSize, offset],
  };
}

/** 可订阅的启用作者。 */
export function selectActiveAuthorId(authorId: number): SqlStatement {
  return {
    sql: `SELECT id FROM author WHERE id = ? AND status = 1 AND is_deleted = 0 LIMIT 1`,
    params: [authorId],
  };
}

export function selectSubscriptionForUpdate(
  userId: number,
  authorId: number,
): SqlStatement {
  return {
    sql: `SELECT id FROM subscription WHERE user_id = ? AND author_id = ? FOR UPDATE`,
    params: [userId, authorId],
  };
}

export function deleteSubscription(subscriptionId: number): SqlStatement {
  return {
    sql: `DELETE FROM subscription WHERE id = ?`,
    params: [subscriptionId],
  };
}

export function insertSubscription(userId: number, authorId: number): SqlStatement {
  return {
    sql: `INSERT INTO subscription (user_id, author_id) VALUES (?, ?)`,
    params: [userId, authorId],
  };
}
