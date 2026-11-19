import type { AdminAuthorInput, AdminAuthorRow, PageResult } from '@sylvie/types';

import { dbClient } from '../../db/index.js';
import {
  buildAdminAuthorWhere,
  countAdminAuthors,
  countAuthorAlbums,
  insertAdminAuthor,
  selectAdminAuthorById,
  selectAdminAuthors,
  selectAuthorByName,
  selectAuthorDuplicate,
  selectAuthorForDelete,
  selectAuthorForEdit,
  selectAuthorForToggle,
  softDeleteAdminAuthor,
  updateAdminAuthorRow,
  updateAdminAuthorStatus,
  type AdminAuthorDbRow,
  type AuthorWriteValues,
} from '../../sql/admin/author-admin.sql.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toPageResult } from '../../utils/format.js';
import { logAdminOp } from './log.service.js';

function mapAuthor(row: AdminAuthorDbRow): AdminAuthorRow {
  return {
    id: Number(row.id),
    name: row.name,
    alias: row.alias,
    initial: row.initial,
    color: row.color,
    avatarUrl: row.avatarUrl,
    coverUrl: row.coverUrl,
    bio: row.bio,
    styleTags: row.styleTags
      ? row.styleTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
    sortWeight: Number(row.sortWeight),
    status: Number(row.status),
    albumCount: Number(row.albumCount),
    lastUpdateAt: row.lastUpdateAt,
    createdAt: row.createdAt,
  };
}

function validateAuthor(input: AdminAuthorInput): AuthorWriteValues {
  const name = input.name.trim();
  const nameLength = Array.from(name).length;
  if (nameLength < 1 || nameLength > 32) {
    throw new HttpError(400, '作者名需为 1-32 个字符');
  }
  const alias = input.alias?.trim() || null;
  if (alias && Array.from(alias).length > 64) {
    throw new HttpError(400, '别名最多 64 个字符');
  }
  const styleTags = input.styleTags?.map((tag) => tag.trim()).filter(Boolean) ?? [];
  if (styleTags.length > 8) {
    throw new HttpError(400, '风格标签最多 8 个');
  }
  const bio = input.bio?.trim() || null;
  if (bio && Array.from(bio).length > 500) {
    throw new HttpError(400, '简介最多 500 个字符');
  }
  return {
    name,
    alias,
    initial: input.initial?.trim() || Array.from(name)[0] || '希',
    color: input.color?.trim() || '#3a3a44',
    avatarUrl: input.avatarUrl ?? null,
    bio,
    styleTags: styleTags.length > 0 ? styleTags.join(',') : null,
    sortWeight: Number.isFinite(input.sortWeight) ? Math.floor(input.sortWeight ?? 10) : 10,
  };
}

export async function getAdminAuthors(query: {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<AdminAuthorRow>> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 6, 200);
  const where = buildAdminAuthorWhere(query);

  const countStatement = countAdminAuthors(where);
  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const listStatement = selectAdminAuthors(where, pageSize, offset);
  const rows = await dbClient.query<AdminAuthorDbRow>(listStatement.sql, listStatement.params);
  return toPageResult(rows.map(mapAuthor), Number(countRow?.total ?? 0), page, pageSize);
}

export async function createAdminAuthor(
  adminId: number,
  input: AdminAuthorInput,
  ip?: string | null,
): Promise<AdminAuthorRow> {
  const data = validateAuthor(input);
  const duplicateStatement = selectAuthorByName(data.name);
  const duplicate = await dbClient.queryOne<{ id: number }>(
    duplicateStatement.sql,
    duplicateStatement.params,
  );
  if (duplicate) {
    throw new HttpError(409, '该作者名已存在');
  }

  const insertStatement = insertAdminAuthor(data);
  const [result] = await dbClient.pool.query(insertStatement.sql, insertStatement.params);
  const authorId = (result as { insertId: number }).insertId;
  await logAdminOp(adminId, 'author.create', 'author', authorId, data, ip);
  return getAdminAuthor(authorId);
}

export async function updateAdminAuthor(
  adminId: number,
  authorId: number,
  input: AdminAuthorInput,
  ip?: string | null,
): Promise<AdminAuthorRow> {
  const data = validateAuthor(input);
  const existingStatement = selectAuthorForEdit(authorId);
  const existing = await dbClient.queryOne<{
    id: number;
    name: string;
    avatarUrl: string | null;
  }>(existingStatement.sql, existingStatement.params);
  if (!existing) {
    throw new HttpError(404, '作者不存在');
  }
  const duplicateStatement = selectAuthorDuplicate(data.name, authorId);
  const duplicate = await dbClient.queryOne<{ id: number }>(
    duplicateStatement.sql,
    duplicateStatement.params,
  );
  if (duplicate) {
    throw new HttpError(409, '该作者名已存在');
  }

  const updateStatement = updateAdminAuthorRow({ ...data, authorId });
  await dbClient.execute(updateStatement.sql, updateStatement.params);
  await logAdminOp(
    adminId,
    'author.edit',
    'author',
    authorId,
    {
      before: { name: existing.name, avatarUrl: existing.avatarUrl },
      after: data,
    },
    ip,
  );
  return getAdminAuthor(authorId);
}

async function getAdminAuthor(authorId: number): Promise<AdminAuthorRow> {
  const statement = selectAdminAuthorById(authorId);
  const row = await dbClient.queryOne<AdminAuthorDbRow>(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '作者不存在');
  }
  return mapAuthor(row);
}

export async function toggleAdminAuthor(
  adminId: number,
  authorId: number,
  ip?: string | null,
): Promise<AdminAuthorRow> {
  const authorStatement = selectAuthorForToggle(authorId);
  const author = await dbClient.queryOne<{ id: number; name: string; status: number }>(
    authorStatement.sql,
    authorStatement.params,
  );
  if (!author) {
    throw new HttpError(404, '作者不存在');
  }
  const next = Number(author.status) === 1 ? 0 : 1;
  const updateStatement = updateAdminAuthorStatus(next, authorId);
  await dbClient.execute(updateStatement.sql, updateStatement.params);
  await logAdminOp(
    adminId,
    next === 1 ? 'author.show' : 'author.hide',
    'author',
    authorId,
    { name: author.name, status: next },
    ip,
  );
  return getAdminAuthor(authorId);
}

export async function deleteAdminAuthor(
  adminId: number,
  authorId: number,
  ip?: string | null,
): Promise<void> {
  const authorStatement = selectAuthorForDelete(authorId);
  const author = await dbClient.queryOne<{ id: number; name: string }>(
    authorStatement.sql,
    authorStatement.params,
  );
  if (!author) {
    throw new HttpError(404, '作者不存在');
  }
  const countStatement = countAuthorAlbums(authorId);
  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const total = Number(countRow?.total ?? 0);
  if (total > 0) {
    throw new HttpError(400, `该作者名下还有 ${total} 套图集，请先转移或删除图集`);
  }
  const deleteStatement = softDeleteAdminAuthor(authorId);
  await dbClient.execute(deleteStatement.sql, deleteStatement.params);
  await logAdminOp(adminId, 'author.delete', 'author', authorId, { name: author.name }, ip);
}
