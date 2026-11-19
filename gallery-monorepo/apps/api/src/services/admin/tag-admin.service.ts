import type { AdminTagRow, PageResult } from '@sylvie/types';

import { dbClient } from '../../db/index.js';
import {
  buildAdminTagWhere,
  countAdminTags,
  countTagAlbumUsage,
  insertAdminTag,
  restoreAdminTag,
  selectAdminTagById,
  selectAdminTags,
  selectTagByName,
  selectTagDuplicate,
  selectTagForEdit,
  selectTagForToggle,
  softDeleteAdminTag,
  updateAdminTagName,
  updateAdminTagStatus,
  type TagDbRow,
} from '../../sql/admin/tag-admin.sql.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toPageResult } from '../../utils/format.js';
import { logAdminOp } from './log.service.js';

function mapTag(row: TagDbRow): AdminTagRow {
  return {
    id: Number(row.id),
    name: row.name,
    useCount: Number(row.useCount),
    status: Number(row.status),
    createdAt: row.createdAt,
  };
}

function validateTagName(input: string): string {
  const name = input.trim().replace(/^#+/, '');
  const length = Array.from(name).length;
  if (length < 1 || length > 20) {
    throw new HttpError(400, '标签名需为 1-20 个字符');
  }
  if (/['"`<>]/.test(name)) {
    throw new HttpError(400, '标签名不能包含引号或尖括号');
  }
  return name;
}

export async function getAdminTags(query: {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<AdminTagRow>> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 8, 200);
  const where = buildAdminTagWhere(query);

  const countStatement = countAdminTags(where);
  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const listStatement = selectAdminTags(where, pageSize, offset);
  const rows = await dbClient.query<TagDbRow>(listStatement.sql, listStatement.params);
  return toPageResult(rows.map(mapTag), Number(countRow?.total ?? 0), page, pageSize);
}

export async function createAdminTag(
  adminId: number,
  nameInput: string,
  ip?: string | null,
): Promise<AdminTagRow> {
  const name = validateTagName(nameInput);
  const existingStatement = selectTagByName(name);
  const existing = await dbClient.queryOne<{ id: number; isDeleted: number }>(
    existingStatement.sql,
    existingStatement.params,
  );
  if (existing && Number(existing.isDeleted) === 0) {
    throw new HttpError(409, '该标签已存在');
  }

  let tagId: number;
  if (existing) {
    const statement = restoreAdminTag(adminId, existing.id);
    await dbClient.execute(statement.sql, statement.params);
    tagId = Number(existing.id);
  } else {
    const statement = insertAdminTag(name, adminId);
    const [result] = await dbClient.pool.query(statement.sql, statement.params);
    tagId = (result as { insertId: number }).insertId;
  }

  await logAdminOp(adminId, 'tag.create', 'tag', tagId, { name }, ip);
  const detailStatement = selectAdminTagById(tagId);
  const row = await dbClient.queryOne<TagDbRow>(detailStatement.sql, detailStatement.params);
  if (!row) {
    throw new HttpError(500, '标签创建失败');
  }
  return mapTag(row);
}

export async function updateAdminTag(
  adminId: number,
  tagId: number,
  nameInput: string,
  ip?: string | null,
): Promise<AdminTagRow> {
  const name = validateTagName(nameInput);
  const tagStatement = selectTagForEdit(tagId);
  const tag = await dbClient.queryOne<{ id: number; name: string }>(
    tagStatement.sql,
    tagStatement.params,
  );
  if (!tag) {
    throw new HttpError(404, '标签不存在');
  }
  const duplicateStatement = selectTagDuplicate(name, tagId);
  const duplicate = await dbClient.queryOne<{ id: number }>(
    duplicateStatement.sql,
    duplicateStatement.params,
  );
  if (duplicate) {
    throw new HttpError(409, '该标签名已被使用');
  }

  const updateStatement = updateAdminTagName(name, tagId);
  await dbClient.execute(updateStatement.sql, updateStatement.params);
  await logAdminOp(adminId, 'tag.edit', 'tag', tagId, { before: tag.name, after: name }, ip);
  const detailStatement = selectAdminTagById(tagId);
  const row = await dbClient.queryOne<TagDbRow>(detailStatement.sql, detailStatement.params);
  if (!row) {
    throw new HttpError(500, '标签更新失败');
  }
  return mapTag(row);
}

export async function toggleAdminTag(
  adminId: number,
  tagId: number,
  ip?: string | null,
): Promise<AdminTagRow> {
  const tagStatement = selectTagForToggle(tagId);
  const tag = await dbClient.queryOne<{ id: number; name: string; status: number }>(
    tagStatement.sql,
    tagStatement.params,
  );
  if (!tag) {
    throw new HttpError(404, '标签不存在');
  }
  const next = Number(tag.status) === 1 ? 0 : 1;
  const updateStatement = updateAdminTagStatus(next, tagId);
  await dbClient.execute(updateStatement.sql, updateStatement.params);
  await logAdminOp(
    adminId,
    next === 1 ? 'tag.show' : 'tag.hide',
    'tag',
    tagId,
    { name: tag.name, status: next },
    ip,
  );
  const detailStatement = selectAdminTagById(tagId);
  const row = await dbClient.queryOne<TagDbRow>(detailStatement.sql, detailStatement.params);
  if (!row) {
    throw new HttpError(500, '标签更新失败');
  }
  return mapTag(row);
}

export async function deleteAdminTag(
  adminId: number,
  tagId: number,
  ip?: string | null,
): Promise<void> {
  const tagStatement = selectTagForEdit(tagId);
  const tag = await dbClient.queryOne<{ id: number; name: string }>(
    tagStatement.sql,
    tagStatement.params,
  );
  if (!tag) {
    throw new HttpError(404, '标签不存在');
  }
  const usedStatement = countTagAlbumUsage(tagId);
  const usedRow = await dbClient.queryOne<{ total: number }>(
    usedStatement.sql,
    usedStatement.params,
  );
  const used = Number(usedRow?.total ?? 0);
  if (used > 0) {
    throw new HttpError(400, `已被 ${used} 套图集收录，不可删除，可先隐藏`);
  }
  const deleteStatement = softDeleteAdminTag(tagId);
  await dbClient.execute(deleteStatement.sql, deleteStatement.params);
  await logAdminOp(adminId, 'tag.delete', 'tag', tagId, { name: tag.name }, ip);
}
