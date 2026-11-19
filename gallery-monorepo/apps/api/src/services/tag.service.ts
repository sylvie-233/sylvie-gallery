import type { TagDto } from '@sylvie/types';

import { dbClient } from '../db/index.js';
import { selectTags, type TagRow } from '../sql/tag.sql.js';

/** 前台标签云：仅展示启用且未删除的标签，按收录数倒序。 */
export async function listTags(): Promise<TagDto[]> {
  const statement = selectTags();
  const rows = await dbClient.query<TagRow>(statement.sql, statement.params);
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    useCount: Number(row.useCount),
  }));
}
