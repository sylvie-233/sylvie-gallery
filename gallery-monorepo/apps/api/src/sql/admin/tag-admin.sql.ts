import { type SqlFragment, type SqlStatement } from '../shared.js';

/** 后台标签列表 / 详情行。 */
export interface TagDbRow {
  id: number;
  name: string;
  useCount: number;
  status: number;
  createdAt: string;
}

/** 后台标签列表筛选：状态 + 名称关键字。 */
export function buildAdminTagWhere(query: { status?: string; keyword?: string }): SqlFragment {
  const conditions = ['is_deleted = 0'];
  const params: unknown[] = [];

  if (query.status === 'on') {
    conditions.push('status = 1');
  } else if (query.status === 'off') {
    conditions.push('status = 0');
  }
  const keyword = query.keyword?.trim() ?? '';
  if (keyword) {
    conditions.push('name LIKE ?');
    params.push(`%${keyword}%`);
  }

  return { sql: conditions.join(' AND '), params };
}

/** 后台标签总数。 */
export function countAdminTags(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM tag WHERE ${where.sql}`,
    params: where.params,
  };
}

/** 后台标签分页列表。 */
export function selectAdminTags(
  where: SqlFragment,
  pageSize: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT id, name, use_count AS useCount, status, created_at AS createdAt
       FROM tag
      WHERE ${where.sql}
      ORDER BY use_count DESC, id DESC
      LIMIT ? OFFSET ?`,
    params: [...where.params, pageSize, offset],
  };
}

/** 按 ID 读取标签（含软删除标记，用于同名复用）。 */
export function selectTagByName(name: string): SqlStatement {
  return {
    sql: `SELECT id, is_deleted AS isDeleted FROM tag WHERE name = ? LIMIT 1`,
    params: [name],
  };
}

/** 恢复已软删除标签。 */
export function restoreAdminTag(adminId: number, tagId: number): SqlStatement {
  return {
    sql: `UPDATE tag SET is_deleted = 0, status = 1, created_by = ? WHERE id = ?`,
    params: [adminId, tagId],
  };
}

/** 新增标签。 */
export function insertAdminTag(name: string, adminId: number): SqlStatement {
  return {
    sql: `INSERT INTO tag (name, use_count, status, created_by) VALUES (?, 0, 1, ?)`,
    params: [name, adminId],
  };
}

/** 按 ID 读取标签详情。 */
export function selectAdminTagById(tagId: number): SqlStatement {
  return {
    sql: `SELECT id, name, use_count AS useCount, status, created_at AS createdAt
       FROM tag WHERE id = ? LIMIT 1`,
    params: [tagId],
  };
}

/** 编辑前读取有效标签。 */
export function selectTagForEdit(tagId: number): SqlStatement {
  return {
    sql: `SELECT id, name FROM tag WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [tagId],
  };
}

/** 检查同名标签是否已被占用。 */
export function selectTagDuplicate(name: string, tagId: number): SqlStatement {
  return {
    sql: `SELECT id FROM tag WHERE name = ? AND id <> ? LIMIT 1`,
    params: [name, tagId],
  };
}

/** 重命名标签。 */
export function updateAdminTagName(name: string, tagId: number): SqlStatement {
  return {
    sql: `UPDATE tag SET name = ? WHERE id = ?`,
    params: [name, tagId],
  };
}

/** 开关前读取标签状态。 */
export function selectTagForToggle(tagId: number): SqlStatement {
  return {
    sql: `SELECT id, name, status FROM tag WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [tagId],
  };
}

/** 设置标签启用状态。 */
export function updateAdminTagStatus(status: number, tagId: number): SqlStatement {
  return {
    sql: `UPDATE tag SET status = ? WHERE id = ?`,
    params: [status, tagId],
  };
}

/** 标签被图集收录的数量。 */
export function countTagAlbumUsage(tagId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total
       FROM album_tag at JOIN album a ON a.id = at.album_id AND a.is_deleted = 0
      WHERE at.tag_id = ?`,
    params: [tagId],
  };
}

/** 软删除标签。 */
export function softDeleteAdminTag(tagId: number): SqlStatement {
  return {
    sql: `UPDATE tag SET is_deleted = 1, status = 0 WHERE id = ?`,
    params: [tagId],
  };
}
