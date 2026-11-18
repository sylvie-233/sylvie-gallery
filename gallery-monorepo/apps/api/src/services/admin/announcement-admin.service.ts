import {
  ANNOUNCEMENT_TYPE_LABELS,
  type AdminAnnouncementInput,
  type AdminAnnouncementRow,
  type AnnouncementType,
  type PageResult,
} from '@sylvie/types';

import { dbClient } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toBool, toPageResult } from '../../utils/format.js';
import { logAdminOp } from './log.service.js';

interface AnnouncementDbRow {
  id: number;
  type: AnnouncementType;
  title: string;
  summary: string | null;
  content: string | null;
  isTop: number;
  status: number;
  publishedAt: string;
  createdAt: string;
}

const ANNOUNCEMENT_SELECT = `id, type, title, summary, content, is_top AS isTop,
  status, published_at AS publishedAt, created_at AS createdAt`;

function mapAnnouncement(row: AnnouncementDbRow): AdminAnnouncementRow {
  return {
    id: Number(row.id),
    type: row.type,
    typeLabel: ANNOUNCEMENT_TYPE_LABELS[row.type] ?? row.type,
    title: row.title,
    summary: row.summary,
    content: row.content,
    isTop: toBool(row.isTop),
    status: Number(row.status),
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
  };
}

function validateInput(input: AdminAnnouncementInput): {
  type: AnnouncementType;
  title: string;
  summary: string | null;
  content: string | null;
  isTop: number;
} {
  const validTypes = Object.keys(ANNOUNCEMENT_TYPE_LABELS);
  if (!validTypes.includes(input.type)) {
    throw new HttpError(400, '公告类型无效');
  }
  const title = input.title.trim();
  if (title.length < 1 || title.length > 128) {
    throw new HttpError(400, '标题需为 1-128 个字符');
  }
  const summary = input.summary?.trim() || null;
  if (summary && Array.from(summary).length > 255) {
    throw new HttpError(400, '摘要最多 255 个字符');
  }
  return {
    type: input.type,
    title,
    summary,
    content: input.content?.trim() || null,
    isTop: input.isTop ? 1 : 0,
  };
}

export async function getAdminAnnouncements(query: {
  type?: string;
  status?: string;
  keyword?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<AdminAnnouncementRow>> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 6);
  const conditions = ['is_deleted = 0'];
  const params: unknown[] = [];

  if (query.type && query.type !== 'all') {
    conditions.push('type = ?');
    params.push(query.type);
  }
  if (query.status === '1' || query.status === '0') {
    conditions.push('status = ?');
    params.push(Number(query.status));
  }
  const keyword = query.keyword?.trim() ?? '';
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
    params.push(like, like, like);
  }
  if (query.from) {
    conditions.push('DATE(published_at) >= ?');
    params.push(query.from);
  }
  if (query.to) {
    conditions.push('DATE(published_at) <= ?');
    params.push(query.to);
  }

  const where = conditions.join(' AND ');
  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM announcement WHERE ${where}`,
    params,
  );
  const rows = await dbClient.query<AnnouncementDbRow>(
    `SELECT ${ANNOUNCEMENT_SELECT}
       FROM announcement
      WHERE ${where}
      ORDER BY is_top DESC, published_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  return toPageResult(rows.map(mapAnnouncement), Number(countRow?.total ?? 0), page, pageSize);
}

async function getAdminAnnouncement(id: number): Promise<AdminAnnouncementRow> {
  const row = await dbClient.queryOne<AnnouncementDbRow>(
    `SELECT ${ANNOUNCEMENT_SELECT} FROM announcement
      WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [id],
  );
  if (!row) {
    throw new HttpError(404, '公告不存在');
  }
  return mapAnnouncement(row);
}

export async function createAdminAnnouncement(
  adminId: number,
  input: AdminAnnouncementInput,
  ip?: string | null,
): Promise<AdminAnnouncementRow> {
  const data = validateInput(input);
  const [result] = await dbClient.pool.query(
    `INSERT INTO announcement (type, title, summary, content, is_top, status, published_at, created_by)
     VALUES (?, ?, ?, ?, ?, 1, NOW(), ?)`,
    [data.type, data.title, data.summary, data.content, data.isTop, adminId],
  );
  const id = (result as { insertId: number }).insertId;
  await logAdminOp(adminId, 'announcement.publish', 'announcement', id, data, ip);
  return getAdminAnnouncement(id);
}

export async function updateAdminAnnouncement(
  adminId: number,
  id: number,
  input: AdminAnnouncementInput,
  ip?: string | null,
): Promise<AdminAnnouncementRow> {
  const data = validateInput(input);
  const existing = await dbClient.queryOne<{ id: number; title: string }>(
    `SELECT id, title FROM announcement WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [id],
  );
  if (!existing) {
    throw new HttpError(404, '公告不存在');
  }
  await dbClient.execute(
    `UPDATE announcement SET type = ?, title = ?, summary = ?, content = ?, is_top = ?
      WHERE id = ?`,
    [data.type, data.title, data.summary, data.content, data.isTop, id],
  );
  await logAdminOp(
    adminId,
    'announcement.edit',
    'announcement',
    id,
    { beforeTitle: existing.title, ...data },
    ip,
  );
  return getAdminAnnouncement(id);
}

export async function toggleAdminAnnouncement(
  adminId: number,
  id: number,
  ip?: string | null,
): Promise<AdminAnnouncementRow> {
  const existing = await dbClient.queryOne<{
    id: number;
    title: string;
    status: number;
  }>(
    `SELECT id, title, status FROM announcement WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [id],
  );
  if (!existing) {
    throw new HttpError(404, '公告不存在');
  }
  const next = Number(existing.status) === 1 ? 0 : 1;
  await dbClient.execute(
    `UPDATE announcement SET status = ?, published_at = IF(?, NOW(), published_at) WHERE id = ?`,
    [next, next, id],
  );
  await logAdminOp(
    adminId,
    next === 1 ? 'announcement.publish' : 'announcement.offline',
    'announcement',
    id,
    { title: existing.title, status: next },
    ip,
  );
  return getAdminAnnouncement(id);
}

export async function deleteAdminAnnouncement(
  adminId: number,
  id: number,
  ip?: string | null,
): Promise<void> {
  const existing = await dbClient.queryOne<{ id: number; title: string }>(
    `SELECT id, title FROM announcement WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [id],
  );
  if (!existing) {
    throw new HttpError(404, '公告不存在');
  }
  await dbClient.execute(`UPDATE announcement SET is_deleted = 1, status = 0 WHERE id = ?`, [id]);
  await logAdminOp(
    adminId,
    'announcement.delete',
    'announcement',
    id,
    { title: existing.title },
    ip,
  );
}
