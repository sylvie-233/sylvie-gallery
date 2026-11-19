import type { SqlStatement } from './shared.js';

/**
 * 前台作者 SQL：作者列表 / 详情、作者首页封面兜底与订阅关系。
 * 作者与订阅列表均只读取启用且未软删除的作者；订阅切换在事务内加锁。
 */

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

// 作者封面缺失时回退到其最新已发布图集的封面；albumCount 为冗余计数。
const AUTHOR_COLUMNS = `a.id, a.name, a.alias, a.initial, a.avatar_url AS avatarUrl,
  COALESCE(a.cover_url, (SELECT al.cover_url FROM album al
    WHERE al.author_id = a.id AND al.status = 'published' AND al.is_deleted = 0
    ORDER BY al.published_at DESC, al.id DESC LIMIT 1)) AS coverUrl,
  a.color, a.bio, a.style_tags AS styleTags, a.album_count AS albumCount,
  a.last_update_at AS lastUpdateAt, a.sort_weight AS sortWeight`;

/** 当前用户订阅的作者 ID 集合，用于列表标记 `subscribed`。 */
export function selectSubscribedAuthorIds(userId: number): SqlStatement {
  return {
    sql: `SELECT author_id AS authorId FROM subscription WHERE user_id = ?`,
    params: [userId],
  };
}

/**
 * 作者列表：启用且未软删除。
 * `term` 非空时对姓名 / 别名 / 风格标签做 LIKE 模糊匹配；
 * 按排序权重、图集数倒序，id 升序保证稳定。
 */
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

/** 作者详情：仅返回启用且未软删除的作者。 */
export function selectAuthorById(authorId: number): SqlStatement {
  return {
    sql: `SELECT ${AUTHOR_COLUMNS}
       FROM author a
      WHERE a.id = ? AND a.status = 1 AND a.is_deleted = 0
      LIMIT 1`,
    params: [authorId],
  };
}

/** 已订阅作者总数（仅统计仍启用且未软删除的作者，供分页 total）。 */
export function countSubscribedAuthors(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total
       FROM subscription s JOIN author a ON a.id = s.author_id
      WHERE s.user_id = ? AND a.status = 1 AND a.is_deleted = 0`,
    params: [userId],
  };
}

/** 已订阅作者分页：按订阅时间、订阅 id 倒序，`limit` / `offset` 由 service 归一化。 */
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

/** 校验作者可订阅（存在、启用且未软删除）。 */
export function selectActiveAuthorId(authorId: number): SqlStatement {
  return {
    sql: `SELECT id FROM author WHERE id = ? AND status = 1 AND is_deleted = 0 LIMIT 1`,
    params: [authorId],
  };
}

/**
 * 订阅事务内 `FOR UPDATE` 读取订阅记录。
 * 加锁后据此决定插入或删除，避免并发点击产生重复订阅 / 重复取消。
 */
export function selectSubscriptionForUpdate(
  userId: number,
  authorId: number,
): SqlStatement {
  return {
    sql: `SELECT id FROM subscription WHERE user_id = ? AND author_id = ? FOR UPDATE`,
    params: [userId, authorId],
  };
}

/** 取消订阅：按订阅记录主键物理删除（订阅关系无软删除语义）。 */
export function deleteSubscription(subscriptionId: number): SqlStatement {
  return {
    sql: `DELETE FROM subscription WHERE id = ?`,
    params: [subscriptionId],
  };
}

/** 新增订阅关系（同一事务内已加锁确认不存在）。 */
export function insertSubscription(userId: number, authorId: number): SqlStatement {
  return {
    sql: `INSERT INTO subscription (user_id, author_id) VALUES (?, ?)`,
    params: [userId, authorId],
  };
}
