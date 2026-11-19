import { type SqlFragment, type SqlStatement } from '../shared.js';

/** 后台作者列表 / 详情行。 */
export interface AdminAuthorDbRow {
  id: number;
  name: string;
  alias: string | null;
  initial: string;
  color: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  styleTags: string | null;
  sortWeight: number;
  status: number;
  albumCount: number;
  lastUpdateAt: string | null;
  createdAt: string;
}

/** 作者写入字段：新增 / 编辑共用。 */
export interface AuthorWriteValues {
  name: string;
  alias: string | null;
  initial: string;
  color: string;
  avatarUrl: string | null;
  bio: string | null;
  styleTags: string | null;
  sortWeight: number;
}

const AUTHOR_SELECT = `a.id, a.name, a.alias, a.initial, a.color, a.avatar_url AS avatarUrl,
  a.cover_url AS coverUrl, a.bio, a.style_tags AS styleTags, a.sort_weight AS sortWeight,
  a.status, a.last_update_at AS lastUpdateAt, a.created_at AS createdAt,
  (SELECT COUNT(*) FROM album al WHERE al.author_id = a.id AND al.is_deleted = 0) AS albumCount`;

/** 后台作者列表筛选：状态 + 名称/别名/风格关键字。 */
export function buildAdminAuthorWhere(query: {
  status?: string;
  keyword?: string;
}): SqlFragment {
  const conditions = ['a.is_deleted = 0'];
  const params: unknown[] = [];

  if (query.status === 'on') {
    conditions.push('a.status = 1');
  } else if (query.status === 'off') {
    conditions.push('a.status = 0');
  }
  const keyword = query.keyword?.trim() ?? '';
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(a.name LIKE ? OR a.alias LIKE ? OR a.style_tags LIKE ?)');
    params.push(like, like, like);
  }

  return { sql: conditions.join(' AND '), params };
}

/** 后台作者总数。 */
export function countAdminAuthors(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM author a WHERE ${where.sql}`,
    params: where.params,
  };
}

/** 后台作者分页列表。 */
export function selectAdminAuthors(
  where: SqlFragment,
  pageSize: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT ${AUTHOR_SELECT}
       FROM author a
      WHERE ${where.sql}
      ORDER BY a.sort_weight DESC, a.id DESC
      LIMIT ? OFFSET ?`,
    params: [...where.params, pageSize, offset],
  };
}

/** 按 ID 读取作者详情。 */
export function selectAdminAuthorById(authorId: number): SqlStatement {
  return {
    sql: `SELECT ${AUTHOR_SELECT} FROM author a
      WHERE a.id = ? AND a.is_deleted = 0 LIMIT 1`,
    params: [authorId],
  };
}

/** 新增前检查同名作者。 */
export function selectAuthorByName(name: string): SqlStatement {
  return {
    sql: `SELECT id FROM author WHERE name = ? AND is_deleted = 0 LIMIT 1`,
    params: [name],
  };
}

/** 新增作者。 */
export function insertAdminAuthor(values: AuthorWriteValues): SqlStatement {
  return {
    sql: `INSERT INTO author (name, alias, initial, color, avatar_url, bio, style_tags, sort_weight, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    params: [
      values.name,
      values.alias,
      values.initial,
      values.color,
      values.avatarUrl,
      values.bio,
      values.styleTags,
      values.sortWeight,
    ],
  };
}

/** 编辑前读取作者。 */
export function selectAuthorForEdit(authorId: number): SqlStatement {
  return {
    sql: `SELECT id, name, avatar_url AS avatarUrl FROM author
      WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [authorId],
  };
}

/** 编辑时检查同名作者。 */
export function selectAuthorDuplicate(name: string, authorId: number): SqlStatement {
  return {
    sql: `SELECT id FROM author WHERE name = ? AND id <> ? AND is_deleted = 0 LIMIT 1`,
    params: [name, authorId],
  };
}

/** 更新作者。 */
export function updateAdminAuthorRow(
  values: AuthorWriteValues & { authorId: number },
): SqlStatement {
  return {
    sql: `UPDATE author SET name = ?, alias = ?, initial = ?, color = ?, avatar_url = ?,
            bio = ?, style_tags = ?, sort_weight = ?
      WHERE id = ?`,
    params: [
      values.name,
      values.alias,
      values.initial,
      values.color,
      values.avatarUrl,
      values.bio,
      values.styleTags,
      values.sortWeight,
      values.authorId,
    ],
  };
}

/** 开关前读取作者状态。 */
export function selectAuthorForToggle(authorId: number): SqlStatement {
  return {
    sql: `SELECT id, name, status FROM author WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [authorId],
  };
}

/** 设置作者启用状态。 */
export function updateAdminAuthorStatus(status: number, authorId: number): SqlStatement {
  return {
    sql: `UPDATE author SET status = ? WHERE id = ?`,
    params: [status, authorId],
  };
}

/** 删除前读取作者。 */
export function selectAuthorForDelete(authorId: number): SqlStatement {
  return {
    sql: `SELECT id, name FROM author WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [authorId],
  };
}

/** 作者名下未删除图集数量。 */
export function countAuthorAlbums(authorId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM album WHERE author_id = ? AND is_deleted = 0`,
    params: [authorId],
  };
}

/** 软删除作者。 */
export function softDeleteAdminAuthor(authorId: number): SqlStatement {
  return {
    sql: `UPDATE author SET is_deleted = 1, status = 0 WHERE id = ?`,
    params: [authorId],
  };
}
