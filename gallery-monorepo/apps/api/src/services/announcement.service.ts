/**
 * 前台公告业务：分页检索、首页精选与搜索日志。
 * 关键词可匹配标题 / 摘要 / 正文，也可按公告类型中文标签命中。
 */
import {
  ANNOUNCEMENT_TYPE_LABELS,
  type AnnouncementDto,
  type PageResult,
} from '@sylvie/types';

import { dbClient } from '../db/index.js';
import {
  announcementListFilter,
  countAnnouncements,
  insertAnnouncementSearchLog,
  selectAnnouncementsPage,
  selectHomeAnnouncements,
  type AnnouncementRow,
} from '../sql/announcement.sql.js';
import { normalizePage, toBool, toPageResult } from '../utils/format.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('announcement');

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
    const statement = insertAnnouncementSearchLog(keyword, userId, resultCount);
    await dbClient.execute(statement.sql, statement.params);
  } catch (error) {
    log.error('搜索日志写入失败', error);
  }
}

/**
 * 公告分页列表。
 * `query.keyword` 为空时返回全部启用公告；非空时同时匹配文本与类型标签，
 * 并异步写入搜索日志（日志失败不影响返回）。`userId` 仅用于搜索日志归属。
 */
export async function listAnnouncements(
  query: { page?: number; pageSize?: number; keyword?: string },
  userId?: number,
): Promise<PageResult<AnnouncementDto>> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 8);
  const keyword = query.keyword?.trim() ?? '';
  const matchedTypeLabels = Object.entries(ANNOUNCEMENT_TYPE_LABELS)
    .filter(([, label]) => label.includes(keyword))
    .map(([type]) => type);
  const where = announcementListFilter(keyword, matchedTypeLabels);

  const countStatement = countAnnouncements(where);
  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const total = Number(countRow?.total ?? 0);

  const pageStatement = selectAnnouncementsPage(where, pageSize, offset);
  const rows = await dbClient.query<AnnouncementRow>(
    pageStatement.sql,
    pageStatement.params,
  );

  if (keyword) {
    await logSearch(keyword, total, userId);
  }

  return toPageResult(rows.map(mapAnnouncement), total, page, pageSize);
}

/** 首页公告：最新 4 条，置顶优先。 */
export async function listHomeAnnouncements(limit = 4): Promise<AnnouncementDto[]> {
  const statement = selectHomeAnnouncements(limit);
  const rows = await dbClient.query<AnnouncementRow>(statement.sql, statement.params);
  return rows.map(mapAnnouncement);
}
