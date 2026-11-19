import type { SqlStatement } from './shared.js';

/** 标签行：id / 名称 / 收录套数。 */
export interface TagRow {
  id: number;
  name: string;
  useCount: number;
}

/** 前台标签云：仅展示启用且未删除、收录数大于 0 的标签。 */
export function selectTags(): SqlStatement {
  return {
    sql: `SELECT id, name, use_count AS useCount
       FROM tag
      WHERE status = 1 AND is_deleted = 0 AND use_count > 0
      ORDER BY use_count DESC, id ASC`,
    params: [],
  };
}
