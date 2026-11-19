/**
 * 后台作者管理：分页列表、新建、编辑、显示 / 隐藏切换与软删除。
 *
 * 作者名需唯一（含软删除过滤）；名下仍有未删除图集时禁止删除；写操作均记录操作日志。
 */
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

/** 将作者行映射为 DTO：style_tags 以逗号分隔存储，这里拆成数组并去掉空项。 */
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

/**
 * 校验并规范化作者入参。
 *
 * 名称 1-32 字符、别名最多 64、风格标签最多 8 个、简介最多 500；
 * 未提供首字母时取名称首字，未提供颜色时使用默认色；风格标签以逗号合并写库。
 */
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

/**
 * 分页查询作者列表。
 *
 * @param query.status on = 显示（status 1）/ off = 隐藏（status 0）
 * @param query.keyword 模糊匹配名称、别名、风格标签
 * @param query.page / query.pageSize 未传默认每页 6 条，上限 200
 * 按 sort_weight 倒序；albumCount 为未删除图集数（含草稿 / 下架）。
 */
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

/**
 * 新建作者，默认 status = 1（显示）。
 *
 * 校验名称唯一（同名未删除作者已存在时抛 409）；插入后记录 author.create 日志并返回详情。
 */
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

/**
 * 编辑作者资料（不改变 status）。
 *
 * 校验存在性与名称唯一（排除自身）；日志同时记录修改前名称 / 头像与修改后完整数据。
 */
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

/** 读取作者详情；不存在或已软删除时抛 404。 */
async function getAdminAuthor(authorId: number): Promise<AdminAuthorRow> {
  const statement = selectAdminAuthorById(authorId);
  const row = await dbClient.queryOne<AdminAuthorDbRow>(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '作者不存在');
  }
  return mapAuthor(row);
}

/**
 * 切换作者显示状态（0 ↔ 1）。
 *
 * 隐藏作者不会自动下架其图集，但保存图集时不能再把隐藏作者用于新图集。
 * 日志按结果记为 author.show / author.hide。
 */
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

/**
 * 软删除作者。
 *
 * 删除前统计名下未删除图集数，大于 0 时拒绝删除，避免产生无归属图集（需先转移或删除）。
 * 通过后置 is_deleted = 1、status = 0，并记录 author.delete 日志。
 */
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
