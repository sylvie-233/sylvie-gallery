import {
  ANNOUNCEMENT_TYPE_LABELS,
  type AnnouncementDto,
  type AnnouncementType,
  type PageResult,
} from '@sylvie/types';

import { dbClient } from '../db/index.js';
import { normalizePage, toBool, toPageResult } from '../utils/format.js';

interface AnnouncementRow {
  id: number;
  type: AnnouncementType;
  title: string;
  summary: string | null;
  content: string | null;
  isTop: number;
  publishedAt: string;
}

const ANNOUNCEMENT_COLUMNS = `id, type, title, summary, content, is_top AS isTop, published_at AS publishedAt`;

function mapAnnouncement(row: AnnouncementRow): AnnouncementDto {
  return {
    id: Number(row.id),
    type: row.type,
    typeLabel: ANNOUNCEMENT_TYPE_LABELS[row.type] ?? row.type,
    title: row.title,
    summary: row.summary,
    content: row.content,
    isTop: toBool(row.isTop),
    publishedAt: row.publishedAt,
  };
}

async function logSearch(keyword: string, resultCount: number, userId?: number): Promise<void> {
  try {
    await dbClient.execute(
      `INSERT INTO search_log (scene, keyword, user_id, result_count, search_date)
       VALUES ('announcement', ?, ?, ?, CURDATE())`,
      [keyword, userId ?? null, resultCount],
    );
  } catch (error) {
    console.error('[api:search-log] 公告搜索日志写入失败', error);
  }
}

export async function listAnnouncements(
  query: { page?: number; pageSize?: number; keyword?: string },
  userId?: number,
): Promise<PageResult<AnnouncementDto>> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 8);
  const keyword = query.keyword?.trim() ?? '';
  const conditions = ['status = 1', 'is_deleted = 0'];
  const params: unknown[] = [];

  if (keyword) {
    const labels = Object.entries(ANNOUNCEMENT_TYPE_LABELS)
      .filter(([, label]) => label.includes(keyword))
      .map(([type]) => type);
    const like = `%${keyword}%`;
    const ors = ['title LIKE ?', 'summary LIKE ?', 'content LIKE ?'];
    params.push(like, like, like);
    if (labels.length > 0) {
      ors.push(`type IN (${labels.map(() => '?').join(', ')})`);
      params.push(...labels);
    }
    conditions.push(`(${ors.join(' OR ')})`);
  }

  const where = conditions.join(' AND ');
  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM announcement WHERE ${where}`,
    params,
  );
  const total = Number(countRow?.total ?? 0);

  const rows = await dbClient.query<AnnouncementRow>(
    `SELECT ${ANNOUNCEMENT_COLUMNS}
       FROM announcement
      WHERE ${where}
      ORDER BY is_top DESC, published_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  if (keyword) {
    await logSearch(keyword, total, userId);
  }

  return toPageResult(rows.map(mapAnnouncement), total, page, pageSize);
}

/** 首页公告：最新 4 条，置顶优先。 */
export async function listHomeAnnouncements(limit = 4): Promise<AnnouncementDto[]> {
  const rows = await dbClient.query<AnnouncementRow>(
    `SELECT ${ANNOUNCEMENT_COLUMNS}
       FROM announcement
      WHERE status = 1 AND is_deleted = 0
      ORDER BY is_top DESC, published_at DESC, id DESC
      LIMIT ?`,
    [limit],
  );
  return rows.map(mapAnnouncement);
}
