import type { TagDto } from '@sylvie/types';

import { dbClient } from '../db/index.js';

interface TagRow {
  id: number;
  name: string;
  useCount: number;
}

/** 前台标签云：仅展示启用且未删除的标签，按收录数倒序。 */
export async function listTags(): Promise<TagDto[]> {
  const rows = await dbClient.query<TagRow>(
    `SELECT id, name, use_count AS useCount
       FROM tag
      WHERE status = 1 AND is_deleted = 0
      ORDER BY use_count DESC, id ASC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    useCount: Number(row.useCount),
  }));
}
