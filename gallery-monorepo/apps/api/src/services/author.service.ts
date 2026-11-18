import type { AuthorDetailDto, AuthorDto, PageResult } from '@sylvie/types';

import { dbClient, queryOneOn } from '../db/index.js';
import { HttpError } from '../utils/http.js';
import { normalizePage, toPageResult } from '../utils/format.js';
import { listAlbums } from './album.service.js';

interface AuthorRow {
  id: number;
  name: string;
  alias: string | null;
  initial: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  color: string;
  bio: string | null;
  styleTags: string | null;
  albumCount: number;
  lastUpdateAt: string | null;
  sortWeight: number;
}

const AUTHOR_COLUMNS = `a.id, a.name, a.alias, a.initial, a.avatar_url AS avatarUrl,
  COALESCE(a.cover_url, (SELECT al.cover_url FROM album al
    WHERE al.author_id = a.id AND al.status = 'published' AND al.is_deleted = 0
    ORDER BY al.published_at DESC, al.id DESC LIMIT 1)) AS coverUrl,
  a.color, a.bio, a.style_tags AS styleTags, a.album_count AS albumCount,
  a.last_update_at AS lastUpdateAt, a.sort_weight AS sortWeight`;

function mapAuthor(row: AuthorRow, subscribed: boolean): AuthorDto {
  return {
    id: Number(row.id),
    name: row.name,
    alias: row.alias,
    initial: row.initial,
    avatarUrl: row.avatarUrl,
    coverUrl: row.coverUrl,
    color: row.color,
    bio: row.bio,
    styleTags: row.styleTags
      ? row.styleTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
    albumCount: Number(row.albumCount),
    lastUpdateAt: row.lastUpdateAt,
    sortWeight: Number(row.sortWeight),
    subscribed,
  };
}

async function loadSubscribedIds(userId: number | undefined): Promise<Set<number>> {
  if (!userId) {
    return new Set();
  }
  const rows = await dbClient.query<{ authorId: number }>(
    `SELECT author_id AS authorId FROM subscription WHERE user_id = ?`,
    [userId],
  );
  return new Set(rows.map((row) => Number(row.authorId)));
}

/** 作者列表：按排序权重降序，支持姓名 / 别名 / 风格标签搜索。 */
export async function listAuthors(keyword?: string, userId?: number): Promise<AuthorDto[]> {
  const term = keyword?.trim().slice(0, 32) ?? '';
  const params: unknown[] = [];
  let search = '';
  if (term) {
    const like = `%${term}%`;
    search = 'AND (a.name LIKE ? OR a.alias LIKE ? OR a.style_tags LIKE ?)';
    params.push(like, like, like);
  }

  const rows = await dbClient.query<AuthorRow>(
    `SELECT ${AUTHOR_COLUMNS}
       FROM author a
      WHERE a.status = 1 AND a.is_deleted = 0 ${search}
      ORDER BY a.sort_weight DESC, a.album_count DESC, a.id ASC`,
    params,
  );
  const subscribed = await loadSubscribedIds(userId);
  return rows.map((row) => mapAuthor(row, subscribed.has(Number(row.id))));
}

/** 作者主页：作者信息 + 相关图集（每页 12 套，按发布时间倒序）。 */
export async function getAuthorDetail(
  authorId: number,
  userId: number | undefined,
  page = 1,
  pageSize = 12,
): Promise<AuthorDetailDto> {
  const row = await dbClient.queryOne<AuthorRow>(
    `SELECT ${AUTHOR_COLUMNS}
       FROM author a
      WHERE a.id = ? AND a.status = 1 AND a.is_deleted = 0
      LIMIT 1`,
    [authorId],
  );
  if (!row) {
    throw new HttpError(404, '作者不存在或已隐藏');
  }

  const subscribed = await loadSubscribedIds(userId);
  const { page: safePage, pageSize: safeSize } = normalizePage(page, pageSize, 12);
  const albums = await listAlbums(
    { authorId, page: safePage, pageSize: safeSize, sort: 'new' },
    userId,
  );

  return {
    author: mapAuthor(row, subscribed.has(Number(row.id))),
    albums: albums.list,
    albumTotal: albums.total,
    albumPage: albums.page,
    albumPageSize: albums.pageSize,
    albumTotalPages: albums.totalPages,
  };
}

/** 已订阅作者：与个人中心卡片一致，每页 12 位。 */
export async function listSubscribedAuthors(
  userId: number,
  page = 1,
  pageSize = 12,
): Promise<PageResult<AuthorDto>> {
  const normalized = normalizePage(page, pageSize, 12);
  const where = `s.user_id = ? AND a.status = 1 AND a.is_deleted = 0`;

  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total
       FROM subscription s JOIN author a ON a.id = s.author_id
      WHERE ${where}`,
    [userId],
  );
  const total = Number(countRow?.total ?? 0);

  const rows = await dbClient.query<AuthorRow>(
    `SELECT ${AUTHOR_COLUMNS}
       FROM subscription s JOIN author a ON a.id = s.author_id
      WHERE ${where}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ? OFFSET ?`,
    [userId, normalized.pageSize, normalized.offset],
  );

  return toPageResult(
    rows.map((row) => mapAuthor(row, true)),
    total,
    normalized.page,
    normalized.pageSize,
  );
}

/** 订阅 / 取消订阅作者。 */
export async function toggleSubscription(
  authorId: number,
  userId: number,
): Promise<{ subscribed: boolean }> {
  const author = await dbClient.queryOne<{ id: number }>(
    `SELECT id FROM author WHERE id = ? AND status = 1 AND is_deleted = 0 LIMIT 1`,
    [authorId],
  );
  if (!author) {
    throw new HttpError(404, '作者不存在或已隐藏');
  }

  return dbClient.transaction(async (conn) => {
    const existing = await queryOneOn<{ id: number }>(
      conn,
      `SELECT id FROM subscription WHERE user_id = ? AND author_id = ? FOR UPDATE`,
      [userId, authorId],
    );
    if (existing) {
      await conn.query(`DELETE FROM subscription WHERE id = ?`, [existing.id]);
      return { subscribed: false };
    }
    await conn.query(`INSERT INTO subscription (user_id, author_id) VALUES (?, ?)`, [
      userId,
      authorId,
    ]);
    return { subscribed: true };
  });
}
