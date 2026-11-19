import type { SqlStatement } from './shared.js';

/**
 * 前台标签 SQL：标签云列表。
 * 只读取启用、未软删除且仍被图集使用的标签，计数来自冗余字段 `tag.use_count`。
 */

/** 标签行：id / 名称 / 收录套数。 */
export interface TagRow {
  id: number;
  name: string;
  useCount: number;
}

/**
 * 前台标签云：仅展示启用且未删除、收录数大于 0 的标签。
 * 无参数；按收录套数倒序、id 升序保证同计数时顺序稳定。
 */
export function selectTags(): SqlStatement {
  return {
    sql: `SELECT id, name, use_count AS useCount
       FROM tag
      WHERE status = 1 AND is_deleted = 0 AND use_count > 0
      ORDER BY use_count DESC, id ASC`,
    params: [],
  };
}
