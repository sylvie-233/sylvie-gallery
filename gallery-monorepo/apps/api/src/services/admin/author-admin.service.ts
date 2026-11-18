import type { AdminAuthorInput, AdminAuthorRow, PageResult } from '@sylvie/types';

import { dbClient } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toPageResult } from '../../utils/format.js';
import { logAdminOp } from './log.service.js';

interface AdminAuthorDbRow {
  id: number;
  name: string;
  alias: string | null;
  initial: string;
  color: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  styleTags: string | null;
  sortWeight: number;
  status: number;
  albumCount: number;
  lastUpdateAt: string | null;
  createdAt: string;
}

const AUTHOR_SELECT = `a.id, a.name, a.alias, a.initial, a.color, a.avatar_url AS avatarUrl,
  a.cover_url AS coverUrl, a.bio, a.style_tags AS styleTags, a.sort_weight AS sortWeight,
  a.status, a.last_update_at AS lastUpdateAt, a.created_at AS createdAt,
  (SELECT COUNT(*) FROM album al WHERE al.author_id = a.id AND al.is_deleted = 0) AS albumCount`;

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

function validateAuthor(input: AdminAuthorInput): {
  name: string;
  alias: string | null;
  initial: string;
  color: string;
  avatarUrl: string | null;
  bio: string | null;
  styleTags: string | null;
  sortWeight: number;
} {
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
  const conditions = ['a.is_deleted = 0'];
  const params: unknown[] = [];

  if (query.status === 'on') {
    conditions.push('a.status = 1');
  } else if (query.status === 'off') {
    conditions.push('a.status = 0');
  }
  const keyword = query.keyword?.trim() ?? '';
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(a.name LIKE ? OR a.alias LIKE ? OR a.style_tags LIKE ?)');
    params.push(like, like, like);
  }

  const where = conditions.join(' AND ');
  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM author a WHERE ${where}`,
    params,
  );
  const rows = await dbClient.query<AdminAuthorDbRow>(
    `SELECT ${AUTHOR_SELECT}
       FROM author a
      WHERE ${where}
      ORDER BY a.sort_weight DESC, a.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  return toPageResult(rows.map(mapAuthor), Number(countRow?.total ?? 0), page, pageSize);
}

export async function createAdminAuthor(
  adminId: number,
  input: AdminAuthorInput,
  ip?: string | null,
): Promise<AdminAuthorRow> {
  const data = validateAuthor(input);
  const duplicate = await dbClient.queryOne<{ id: number }>(
    `SELECT id FROM author WHERE name = ? AND is_deleted = 0 LIMIT 1`,
    [data.name],
  );
  if (duplicate) {
    throw new HttpError(409, '该作者名已存在');
  }

  const [result] = await dbClient.pool.query(
    `INSERT INTO author (name, alias, initial, color, avatar_url, bio, style_tags, sort_weight, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      data.name,
      data.alias,
      data.initial,
      data.color,
      data.avatarUrl,
      data.bio,
      data.styleTags,
      data.sortWeight,
    ],
  );
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
  const existing = await dbClient.queryOne<{ id: number; name: string; avatarUrl: string | null }>(
    `SELECT id, name, avatar_url AS avatarUrl FROM author
      WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [authorId],
  );
  if (!existing) {
    throw new HttpError(404, '作者不存在');
  }
  const duplicate = await dbClient.queryOne<{ id: number }>(
    `SELECT id FROM author WHERE name = ? AND id <> ? AND is_deleted = 0 LIMIT 1`,
    [data.name, authorId],
  );
  if (duplicate) {
    throw new HttpError(409, '该作者名已存在');
  }

  await dbClient.execute(
    `UPDATE author SET name = ?, alias = ?, initial = ?, color = ?, avatar_url = ?,
            bio = ?, style_tags = ?, sort_weight = ?
      WHERE id = ?`,
    [
      data.name,
      data.alias,
      data.initial,
      data.color,
      data.avatarUrl,
      data.bio,
      data.styleTags,
      data.sortWeight,
      authorId,
    ],
  );
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
  const row = await dbClient.queryOne<AdminAuthorDbRow>(
    `SELECT ${AUTHOR_SELECT} FROM author a
      WHERE a.id = ? AND a.is_deleted = 0 LIMIT 1`,
    [authorId],
  );
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
  const author = await dbClient.queryOne<{ id: number; name: string; status: number }>(
    `SELECT id, name, status FROM author WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [authorId],
  );
  if (!author) {
    throw new HttpError(404, '作者不存在');
  }
  const next = Number(author.status) === 1 ? 0 : 1;
  await dbClient.execute(`UPDATE author SET status = ? WHERE id = ?`, [next, authorId]);
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
  const author = await dbClient.queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM author WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [authorId],
  );
  if (!author) {
    throw new HttpError(404, '作者不存在');
  }
  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM album WHERE author_id = ? AND is_deleted = 0`,
    [authorId],
  );
  const total = Number(countRow?.total ?? 0);
  if (total > 0) {
    throw new HttpError(400, `该作者名下还有 ${total} 套图集，请先转移或删除图集`);
  }
  await dbClient.execute(`UPDATE author SET is_deleted = 1, status = 0 WHERE id = ?`, [authorId]);
  await logAdminOp(adminId, 'author.delete', 'author', authorId, { name: author.name }, ip);
}
