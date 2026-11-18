import type { AdminTagRow, PageResult } from '@sylvie/types';

import { dbClient } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toPageResult } from '../../utils/format.js';
import { logAdminOp } from './log.service.js';

interface TagDbRow {
  id: number;
  name: string;
  useCount: number;
  status: number;
  createdAt: string;
}

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
  const conditions = ['is_deleted = 0'];
  const params: unknown[] = [];

  if (query.status === 'on') {
    conditions.push('status = 1');
  } else if (query.status === 'off') {
    conditions.push('status = 0');
  }
  const keyword = query.keyword?.trim() ?? '';
  if (keyword) {
    conditions.push('name LIKE ?');
    params.push(`%${keyword}%`);
  }

  const where = conditions.join(' AND ');
  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM tag WHERE ${where}`,
    params,
  );
  const rows = await dbClient.query<TagDbRow>(
    `SELECT id, name, use_count AS useCount, status, created_at AS createdAt
       FROM tag
      WHERE ${where}
      ORDER BY use_count DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  return toPageResult(rows.map(mapTag), Number(countRow?.total ?? 0), page, pageSize);
}

export async function createAdminTag(
  adminId: number,
  nameInput: string,
  ip?: string | null,
): Promise<AdminTagRow> {
  const name = validateTagName(nameInput);
  const existing = await dbClient.queryOne<{ id: number; isDeleted: number }>(
    `SELECT id, is_deleted AS isDeleted FROM tag WHERE name = ? LIMIT 1`,
    [name],
  );
  if (existing && Number(existing.isDeleted) === 0) {
    throw new HttpError(409, '该标签已存在');
  }

  let tagId: number;
  if (existing) {
    await dbClient.execute(
      `UPDATE tag SET is_deleted = 0, status = 1, created_by = ? WHERE id = ?`,
      [adminId, existing.id],
    );
    tagId = Number(existing.id);
  } else {
    const [result] = await dbClient.pool.query(
      `INSERT INTO tag (name, use_count, status, created_by) VALUES (?, 0, 1, ?)`,
      [name, adminId],
    );
    tagId = (result as { insertId: number }).insertId;
  }

  await logAdminOp(adminId, 'tag.create', 'tag', tagId, { name }, ip);
  const row = await dbClient.queryOne<TagDbRow>(
    `SELECT id, name, use_count AS useCount, status, created_at AS createdAt
       FROM tag WHERE id = ? LIMIT 1`,
    [tagId],
  );
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
  const tag = await dbClient.queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM tag WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [tagId],
  );
  if (!tag) {
    throw new HttpError(404, '标签不存在');
  }
  const duplicate = await dbClient.queryOne<{ id: number }>(
    `SELECT id FROM tag WHERE name = ? AND id <> ? LIMIT 1`,
    [name, tagId],
  );
  if (duplicate) {
    throw new HttpError(409, '该标签名已被使用');
  }

  await dbClient.execute(`UPDATE tag SET name = ? WHERE id = ?`, [name, tagId]);
  await logAdminOp(adminId, 'tag.edit', 'tag', tagId, { before: tag.name, after: name }, ip);
  const row = await dbClient.queryOne<TagDbRow>(
    `SELECT id, name, use_count AS useCount, status, created_at AS createdAt
       FROM tag WHERE id = ? LIMIT 1`,
    [tagId],
  );
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
  const tag = await dbClient.queryOne<{ id: number; name: string; status: number }>(
    `SELECT id, name, status FROM tag WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [tagId],
  );
  if (!tag) {
    throw new HttpError(404, '标签不存在');
  }
  const next = Number(tag.status) === 1 ? 0 : 1;
  await dbClient.execute(`UPDATE tag SET status = ? WHERE id = ?`, [next, tagId]);
  await logAdminOp(
    adminId,
    next === 1 ? 'tag.show' : 'tag.hide',
    'tag',
    tagId,
    { name: tag.name, status: next },
    ip,
  );
  const row = await dbClient.queryOne<TagDbRow>(
    `SELECT id, name, use_count AS useCount, status, created_at AS createdAt
       FROM tag WHERE id = ? LIMIT 1`,
    [tagId],
  );
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
  const tag = await dbClient.queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM tag WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [tagId],
  );
  if (!tag) {
    throw new HttpError(404, '标签不存在');
  }
  const usedRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total
       FROM album_tag at JOIN album a ON a.id = at.album_id AND a.is_deleted = 0
      WHERE at.tag_id = ?`,
    [tagId],
  );
  const used = Number(usedRow?.total ?? 0);
  if (used > 0) {
    throw new HttpError(400, `已被 ${used} 套图集收录，不可删除，可先隐藏`);
  }
  await dbClient.execute(`UPDATE tag SET is_deleted = 1, status = 0 WHERE id = ?`, [tagId]);
  await logAdminOp(adminId, 'tag.delete', 'tag', tagId, { name: tag.name }, ip);
}
