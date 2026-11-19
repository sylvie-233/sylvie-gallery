/**
 * 后台标签的参数化 SQL：筛选列表、同名检查（含软删除复用）、新建 / 恢复、改名、
 * 显示隐藏、收录数校验与软删除。
 *
 * 标签名在库中应唯一，因此同名检查包含已软删除记录。
 */
import { type SqlFragment, type SqlStatement } from '../shared.js';

/** 后台标签列表 / 详情行。 */
export interface TagDbRow {
  id: number;
  name: string;
  useCount: number;
  status: number;
  createdAt: string;
}

/**
 * 构建标签列表 WHERE 片段。
 *
 * - 固定条件：is_deleted = 0；
 * - status = 'on' 过滤启用，'off' 过滤隐藏；
 * - keyword 去空白后按名称 LIKE 匹配。
 */
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

/** 标签分页列表：按收录数倒序、id 倒序；limit / offset 由调用方计算。 */
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

/**
 * 按名称读取标签（不过滤软删除），同时返回 is_deleted。
 * service 据此判断：未删除则冲突；已删除则复用原记录恢复。
 */
export function selectTagByName(name: string): SqlStatement {
  return {
    sql: `SELECT id, is_deleted AS isDeleted FROM tag WHERE name = ? LIMIT 1`,
    params: [name],
  };
}

/** 恢复已软删除标签：清除删除标记、重新启用并更新创建人。 */
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

/** 检查同名标签是否已被占用：排除自身，但包含软删除记录（唯一索引约束）。 */
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

/**
 * 标签被未删除图集收录的数量（不区分发布状态），用于删除保护：
 * 大于 0 时只能隐藏，不能删除。
 */
export function countTagAlbumUsage(tagId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total
       FROM album_tag at JOIN album a ON a.id = at.album_id AND a.is_deleted = 0
      WHERE at.tag_id = ?`,
    params: [tagId],
  };
}

/** 软删除标签：置 is_deleted = 1、status = 0，保留记录以便同名复用。 */
export function softDeleteAdminTag(tagId: number): SqlStatement {
  return {
    sql: `UPDATE tag SET is_deleted = 1, status = 0 WHERE id = ?`,
    params: [tagId],
  };
}
