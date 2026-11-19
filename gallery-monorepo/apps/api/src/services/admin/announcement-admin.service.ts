import {
  ANNOUNCEMENT_TYPE_LABELS,
  type AdminAnnouncementInput,
  type AdminAnnouncementRow,
  type PageResult,
} from '@sylvie/types';

import { dbClient } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toBool, toPageResult } from '../../utils/format.js';
import {
  buildAnnouncementWhere,
  countAdminAnnouncements,
  insertAnnouncement,
  selectAdminAnnouncementById,
  selectAdminAnnouncements,
  selectAnnouncementIdentity,
  selectAnnouncementStatus,
  softDeleteAnnouncement,
  toggleAnnouncement,
  updateAnnouncement,
  type AnnouncementRow,
  type AnnouncementWriteData,
} from '../../sql/admin/announcement-admin.sql.js';
import { logAdminOp } from './log.service.js';

function mapAnnouncement(row: AnnouncementRow): AdminAnnouncementRow {
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

function validateInput(input: AdminAnnouncementInput): AnnouncementWriteData {
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
  const where = buildAnnouncementWhere(query);
  const countStatement = countAdminAnnouncements(where);
  const rowsStatement = selectAdminAnnouncements(where, pageSize, offset);

  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const rows = await dbClient.query<AnnouncementRow>(rowsStatement.sql, rowsStatement.params);
  return toPageResult(rows.map(mapAnnouncement), Number(countRow?.total ?? 0), page, pageSize);
}

async function getAdminAnnouncement(id: number): Promise<AdminAnnouncementRow> {
  const statement = selectAdminAnnouncementById(id);
  const row = await dbClient.queryOne<AnnouncementRow>(statement.sql, statement.params);
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
  const statement = insertAnnouncement(data, adminId);
  const [result] = await dbClient.pool.query(statement.sql, statement.params);
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
  const identityStatement = selectAnnouncementIdentity(id);
  const existing = await dbClient.queryOne<{ id: number; title: string }>(
    identityStatement.sql,
    identityStatement.params,
  );
  if (!existing) {
    throw new HttpError(404, '公告不存在');
  }
  const updateStatement = updateAnnouncement(id, data);
  await dbClient.execute(updateStatement.sql, updateStatement.params);
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
  const statusStatement = selectAnnouncementStatus(id);
  const existing = await dbClient.queryOne<{
    id: number;
    title: string;
    status: number;
  }>(statusStatement.sql, statusStatement.params);
  if (!existing) {
    throw new HttpError(404, '公告不存在');
  }
  const next = Number(existing.status) === 1 ? 0 : 1;
  const toggleStatement = toggleAnnouncement(next, id);
  await dbClient.execute(toggleStatement.sql, toggleStatement.params);
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
  const identityStatement = selectAnnouncementIdentity(id);
  const existing = await dbClient.queryOne<{ id: number; title: string }>(
    identityStatement.sql,
    identityStatement.params,
  );
  if (!existing) {
    throw new HttpError(404, '公告不存在');
  }
  const deleteStatement = softDeleteAnnouncement(id);
  await dbClient.execute(deleteStatement.sql, deleteStatement.params);
  await logAdminOp(
    adminId,
    'announcement.delete',
    'announcement',
    id,
    { title: existing.title },
    ip,
  );
}
