/**
 * 后台公告管理：分页列表、新建、编辑、上下架切换与软删除。
 *
 * 所有写操作都会通过 logAdminOp 记录操作日志；删除仅置 is_deleted，不物理删除。
 */
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

/** 将公告行映射为后台 DTO，补充类型中文标签并把 status / is_top 转为数字与布尔。 */
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

/**
 * 校验并规范化公告入参：类型必须在预设枚举内，标题 1-128 字符，摘要最多 255 字符。
 * 返回可直接写库的数据，空摘要 / 内容写入 null。
 */
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

/**
 * 分页查询公告列表。
 *
 * @param query.type 公告类型，传 all 或省略表示不过滤
 * @param query.status '1' 展示 / '0' 隐藏
 * @param query.keyword 模糊匹配标题、摘要、正文
 * @param query.from / query.to 按发布时间（日期）区间过滤
 * @param query.page / query.pageSize 未传时默认每页 6 条
 * 排序为置顶优先，其次发布时间倒序。
 */
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

/** 读取单条公告详情；不存在或已软删除时抛 404。 */
async function getAdminAnnouncement(id: number): Promise<AdminAnnouncementRow> {
  const statement = selectAdminAnnouncementById(id);
  const row = await dbClient.queryOne<AnnouncementRow>(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '公告不存在');
  }
  return mapAnnouncement(row);
}

/**
 * 新建公告，直接以展示状态发布并写入 published_at，记录 announcement.publish 日志。
 * 返回创建后的完整详情。
 */
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

/**
 * 编辑公告内容。先校验存在性，再更新类型、标题、摘要、正文与置顶标记。
 * 日志保留修改前标题（beforeTitle）便于追溯；不改变 status / published_at。
 */
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

/**
 * 切换公告展示状态（0 ↔ 1）。重新展示时刷新 published_at，日志按结果记为
 * announcement.publish / announcement.offline。
 */
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

/**
 * 软删除公告：置 is_deleted = 1 且 status = 0，保留数据用于审计。
 * 操作写入 announcement.delete 日志。
 */
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
