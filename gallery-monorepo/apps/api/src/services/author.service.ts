import type { AuthorDetailDto, AuthorDto, PageResult } from '@sylvie/types';

import { dbClient, queryOneOn } from '../db/index.js';
import {
  countSubscribedAuthors,
  deleteSubscription,
  insertSubscription,
  selectActiveAuthorId,
  selectAuthorById,
  selectAuthors,
  selectSubscribedAuthorIds,
  selectSubscribedAuthors,
  selectSubscriptionForUpdate,
  type AuthorRow,
} from '../sql/author.sql.js';
import { HttpError } from '../utils/http.js';
import { normalizePage, toPageResult } from '../utils/format.js';
import { listAlbums } from './album.service.js';

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
  const statement = selectSubscribedAuthorIds(userId);
  const rows = await dbClient.query<{ authorId: number }>(statement.sql, statement.params);
  return new Set(rows.map((row) => Number(row.authorId)));
}

/** 作者列表：按排序权重降序，支持姓名 / 别名 / 风格标签搜索。 */
export async function listAuthors(keyword?: string, userId?: number): Promise<AuthorDto[]> {
  const term = keyword?.trim().slice(0, 32) ?? '';
  const statement = selectAuthors(term);
  const rows = await dbClient.query<AuthorRow>(statement.sql, statement.params);
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
  const statement = selectAuthorById(authorId);
  const row = await dbClient.queryOne<AuthorRow>(statement.sql, statement.params);
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

  const countStatement = countSubscribedAuthors(userId);
  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const total = Number(countRow?.total ?? 0);

  const pageStatement = selectSubscribedAuthors(
    userId,
    normalized.pageSize,
    normalized.offset,
  );
  const rows = await dbClient.query<AuthorRow>(pageStatement.sql, pageStatement.params);

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
  const authorStatement = selectActiveAuthorId(authorId);
  const author = await dbClient.queryOne<{ id: number }>(
    authorStatement.sql,
    authorStatement.params,
  );
  if (!author) {
    throw new HttpError(404, '作者不存在或已隐藏');
  }

  return dbClient.transaction(async (conn) => {
    const existingStatement = selectSubscriptionForUpdate(userId, authorId);
    const existing = await queryOneOn<{ id: number }>(
      conn,
      existingStatement.sql,
      existingStatement.params,
    );
    if (existing) {
      const deleteStatement = deleteSubscription(Number(existing.id));
      await conn.query(deleteStatement.sql, deleteStatement.params);
      return { subscribed: false };
    }
    const insertStatement = insertSubscription(userId, authorId);
    await conn.query(insertStatement.sql, insertStatement.params);
    return { subscribed: true };
  });
}
