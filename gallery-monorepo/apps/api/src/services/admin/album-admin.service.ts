import type {
  AdminAlbumDetail,
  AdminAlbumRow,
  AdminAlbumSaveInput,
  AdminAlbumStatus,
  AdminMediaInput,
  PageResult,
  TagDto,
} from '@sylvie/types';

import { dbClient, queryOn, type TransactionConnection } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toBool, toPageResult, toSqlDateTime } from '../../utils/format.js';
import { getObjectSize } from '../storage.service.js';
import { logAdminOp } from './log.service.js';

interface AdminAlbumDbRow {
  id: number;
  title: string;
  description: string | null;
  coverUrl: string;
  imageCount: number;
  videoCount: number;
  packageSize: string | number;
  points: number;
  viewCount: number;
  favCount: number;
  isRecommended: number;
  status: AdminAlbumStatus;
  publishedAt: string | null;
  createdAt: string;
  authorId: number;
  authorName: string;
  authorInitial: string;
  authorColor: string;
  authorAvatarUrl: string | null;
}

interface MediaDbRow {
  id: number;
  mediaType: 'image' | 'video';
  url: string;
  thumbUrl: string | null;
  watermarkUrl: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  sortOrder: number;
}

const ALBUM_SELECT = `a.id, a.title, a.description, a.cover_url AS coverUrl,
  a.image_count AS imageCount, a.video_count AS videoCount, a.package_size AS packageSize,
  a.points, a.view_count AS viewCount, a.fav_count AS favCount,
  a.is_recommended AS isRecommended, a.status, a.published_at AS publishedAt,
  a.created_at AS createdAt,
  au.id AS authorId, au.name AS authorName, au.initial AS authorInitial,
  au.color AS authorColor, au.avatar_url AS authorAvatarUrl`;
const ALBUM_FROM = `FROM album a JOIN author au ON au.id = a.author_id`;

function mapAlbumRow(row: AdminAlbumDbRow): AdminAlbumRow {
  return {
    id: Number(row.id),
    title: row.title,
    coverUrl: row.coverUrl,
    authorId: Number(row.authorId),
    authorName: row.authorName,
    authorInitial: row.authorInitial,
    authorColor: row.authorColor,
    authorAvatarUrl: row.authorAvatarUrl,
    imageCount: Number(row.imageCount),
    videoCount: Number(row.videoCount),
    points: Number(row.points),
    viewCount: Number(row.viewCount),
    favCount: Number(row.favCount),
    isRecommended: toBool(row.isRecommended),
    status: row.status,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
  };
}

function mapMedia(row: MediaDbRow): AdminMediaInput {
  return {
    id: Number(row.id),
    url: row.url,
    thumbUrl: row.thumbUrl,
    watermarkUrl: row.watermarkUrl,
    width: row.width === null ? null : Number(row.width),
    height: row.height === null ? null : Number(row.height),
    duration: row.duration === null ? null : Number(row.duration),
  };
}

export async function getAdminAlbums(query: {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<AdminAlbumRow>> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 6);
  const status = query.status;
  const keyword = query.keyword?.trim().slice(0, 64) ?? '';
  const conditions = ['a.is_deleted = 0'];
  const params: unknown[] = [];

  if (status === 'published' || status === 'draft' || status === 'offline') {
    conditions.push('a.status = ?');
    params.push(status);
  }
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(a.title LIKE ? OR au.name LIKE ?)');
    params.push(like, like);
  }

  const where = conditions.join(' AND ');
  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total ${ALBUM_FROM} WHERE ${where}`,
    params,
  );
  const rows = await dbClient.query<AdminAlbumDbRow>(
    `SELECT ${ALBUM_SELECT} ${ALBUM_FROM}
      WHERE ${where}
      ORDER BY COALESCE(a.published_at, a.created_at) DESC, a.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return toPageResult(rows.map(mapAlbumRow), Number(countRow?.total ?? 0), page, pageSize);
}

export async function getAdminAlbumDetail(albumId: number): Promise<AdminAlbumDetail> {
  const row = await dbClient.queryOne<AdminAlbumDbRow>(
    `SELECT ${ALBUM_SELECT} ${ALBUM_FROM}
      WHERE a.id = ? AND a.is_deleted = 0
      LIMIT 1`,
    [albumId],
  );
  if (!row) {
    throw new HttpError(404, '图集不存在');
  }

  const [tagRows, mediaRows] = await Promise.all([
    dbClient.query<{ id: number; name: string; useCount: number }>(
      `SELECT t.id, t.name, t.use_count AS useCount
         FROM album_tag at JOIN tag t ON t.id = at.tag_id
        WHERE at.album_id = ? AND t.is_deleted = 0
        ORDER BY t.use_count DESC, t.id ASC`,
      [albumId],
    ),
    dbClient.query<MediaDbRow>(
      `SELECT id, media_type AS mediaType, url, thumb_url AS thumbUrl,
              watermark_url AS watermarkUrl, width, height, duration, sort_order AS sortOrder
         FROM album_image
        WHERE album_id = ? AND is_deleted = 0
        ORDER BY sort_order ASC, id ASC`,
      [albumId],
    ),
  ]);

  const tags: TagDto[] = tagRows.map((tag) => ({
    id: Number(tag.id),
    name: tag.name,
    useCount: Number(tag.useCount),
  }));

  return {
    ...mapAlbumRow(row),
    description: row.description,
    tags,
    images: mediaRows.filter((media) => media.mediaType === 'image').map(mapMedia),
    videos: mediaRows.filter((media) => media.mediaType === 'video').map(mapMedia),
  };
}

async function estimatePackageSizeMb(images: AdminMediaInput[]): Promise<number> {
  if (images.length === 0) {
    return 0;
  }

  const sizes: number[] = [];
  const batchSize = 8;
  for (let start = 0; start < images.length; start += batchSize) {
    const batch = images.slice(start, start + batchSize);
    const results = await Promise.all(
      batch.map(async (image) => {
        if (image.size && image.size > 0) {
          return image.size;
        }
        if (image.url.startsWith('/api/files/')) {
          const key = image.url.slice('/api/files/'.length);
          return (await getObjectSize(key)) ?? 0;
        }
        if (/^https?:\/\//i.test(image.url)) {
          try {
            const response = await fetch(image.url, {
              method: 'HEAD',
              signal: AbortSignal.timeout(2500),
            });
            return Number(response.headers.get('content-length') ?? 0) || 0;
          } catch {
            return 0;
          }
        }
        return 0;
      }),
    );
    sizes.push(...results);
  }

  const total = sizes.reduce((sum, size) => sum + size, 0);
  return Math.round((total / 1024 / 1024) * 100) / 100;
}

async function recalcTags(conn: TransactionConnection, tagIds: number[]): Promise<void> {
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) {
    return;
  }
  const placeholders = unique.map(() => '?').join(', ');
  await conn.query(
    `UPDATE tag t SET use_count = (
       SELECT COUNT(*) FROM album_tag at
       JOIN album a ON a.id = at.album_id AND a.status = 'published' AND a.is_deleted = 0
       WHERE at.tag_id = t.id
     ) WHERE t.id IN (${placeholders})`,
    unique,
  );
}

async function recalcAuthors(conn: TransactionConnection, authorIds: number[]): Promise<void> {
  const unique = [...new Set(authorIds)];
  for (const authorId of unique) {
    await conn.query(
      `UPDATE author a SET
         album_count = (SELECT COUNT(*) FROM album al
           WHERE al.author_id = a.id AND al.status = 'published' AND al.is_deleted = 0),
         last_update_at = (SELECT MAX(al.published_at) FROM album al
           WHERE al.author_id = a.id AND al.status = 'published' AND al.is_deleted = 0)
       WHERE a.id = ?`,
      [authorId],
    );
  }
}

async function syncMedia(
  conn: TransactionConnection,
  albumId: number,
  existingRows: MediaDbRow[],
  images: AdminMediaInput[],
  videos: AdminMediaInput[],
): Promise<void> {
  const existingIds = new Set(existingRows.map((row) => Number(row.id)));
  const usedIds = new Set<number>();

  const writeList = async (
    mediaType: 'image' | 'video',
    list: AdminMediaInput[],
  ): Promise<void> => {
    for (const [index, media] of list.entries()) {
      const sortOrder = index + 1;
      if (media.id && existingIds.has(media.id)) {
        usedIds.add(media.id);
        await conn.query(
          `UPDATE album_image SET media_type = ?, url = ?, thumb_url = ?, watermark_url = ?,
                  width = ?, height = ?, duration = ?, sort_order = ?, is_deleted = 0
            WHERE id = ? AND album_id = ?`,
          [
            mediaType,
            media.url,
            media.thumbUrl ?? null,
            media.watermarkUrl ?? null,
            media.width ?? null,
            media.height ?? null,
            media.duration ?? null,
            sortOrder,
            media.id,
            albumId,
          ],
        );
      } else {
        await conn.query(
          `INSERT INTO album_image (album_id, media_type, url, thumb_url, watermark_url,
             width, height, duration, sort_order, is_deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            albumId,
            mediaType,
            media.url,
            media.thumbUrl ?? null,
            media.watermarkUrl ?? null,
            media.width ?? null,
            media.height ?? null,
            media.duration ?? null,
            sortOrder,
          ],
        );
      }
    }
  };

  await writeList('image', images);
  await writeList('video', videos);

  const staleIds = [...existingIds].filter((id) => !usedIds.has(id));
  if (staleIds.length > 0) {
    const placeholders = staleIds.map(() => '?').join(', ');
    await conn.query(
      `UPDATE album_image SET is_deleted = 1 WHERE album_id = ? AND id IN (${placeholders})`,
      [albumId, ...staleIds],
    );
  }
}

export async function saveAdminAlbum(
  adminId: number,
  input: AdminAlbumSaveInput,
  albumId: number | null,
  ip?: string | null,
): Promise<AdminAlbumDetail> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 60) {
    throw new HttpError(400, '标题需为 1-60 个字符');
  }
  if (input.images.length > 99) {
    throw new HttpError(400, '图片最多 99 张');
  }
  if (input.videos.length > 3) {
    throw new HttpError(400, '视频最多 3 个');
  }
  const points = Math.min(99, Math.max(0, Math.floor(input.points)));

  const existing = albumId
    ? await dbClient.queryOne<AdminAlbumDbRow>(
        `SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE a.id = ? AND a.is_deleted = 0 LIMIT 1`,
        [albumId],
      )
    : null;
  if (albumId && !existing) {
    throw new HttpError(404, '图集不存在');
  }

  const author = await dbClient.queryOne<{ id: number; status: number }>(
    `SELECT id, status FROM author WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [input.authorId],
  );
  if (!author) {
    throw new HttpError(400, '归属作者不存在');
  }
  if (author.status !== 1 && (!existing || existing.authorId !== input.authorId)) {
    throw new HttpError(400, '该作者已隐藏，不能用于新图集');
  }

  const tagIds = [...new Set(input.tagIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (tagIds.length > 8) {
    throw new HttpError(400, '最多选择 8 个标签');
  }
  if (tagIds.length > 0) {
    const placeholders = tagIds.map(() => '?').join(', ');
    const validRows = await dbClient.query<{ id: number }>(
      `SELECT id FROM tag WHERE id IN (${placeholders}) AND is_deleted = 0`,
      tagIds,
    );
    if (validRows.length !== tagIds.length) {
      throw new HttpError(400, '包含无效标签，请刷新后重试');
    }
  }

  const status: AdminAlbumStatus =
    input.status === 'draft' || input.status === 'offline' || input.status === 'published'
      ? input.status
      : (existing?.status ?? 'draft');
  const packageSize = await estimatePackageSizeMb(input.images);
  const coverUrl = input.coverUrl || input.images[0]?.url || existing?.coverUrl || '';
  const imageCount = input.images.length;
  const videoCount = input.videos.length;
  const oldTagIds = existing
    ? (
        await dbClient.query<{ tagId: number }>(
          `SELECT tag_id AS tagId FROM album_tag WHERE album_id = ?`,
          [albumId],
        )
      ).map((row) => Number(row.tagId))
    : [];

  const targetId = await dbClient.transaction(async (conn) => {
    let currentId = albumId;
    let publishedAt = existing?.publishedAt ?? null;
    if (status === 'published' && existing?.status !== 'published') {
      publishedAt = toSqlDateTime();
    }
    if (status !== 'published' && !existing) {
      publishedAt = null;
    }

    if (!currentId) {
      const [result] = await conn.query(
        `INSERT INTO album (author_id, title, description, cover_url, image_count, video_count,
           package_size, points, status, published_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.authorId,
          title,
          input.description?.trim() || null,
          coverUrl,
          imageCount,
          videoCount,
          packageSize,
          points,
          status,
          publishedAt,
          adminId,
        ],
      );
      currentId = (result as { insertId: number }).insertId;
    } else {
      await conn.query(
        `UPDATE album SET author_id = ?, title = ?, description = ?, cover_url = ?,
                image_count = ?, video_count = ?, package_size = ?, points = ?,
                status = ?, published_at = ?
          WHERE id = ?`,
        [
          input.authorId,
          title,
          input.description?.trim() || null,
          coverUrl,
          imageCount,
          videoCount,
          packageSize,
          points,
          status,
          publishedAt,
          currentId,
        ],
      );
    }

    await conn.query(`DELETE FROM album_tag WHERE album_id = ?`, [currentId]);
    for (const tagId of tagIds) {
      await conn.query(`INSERT INTO album_tag (album_id, tag_id) VALUES (?, ?)`, [currentId, tagId]);
    }

    const existingMedia = await queryOn<MediaDbRow>(
      conn,
      `SELECT id, media_type AS mediaType, url, thumb_url AS thumbUrl,
              watermark_url AS watermarkUrl, width, height, duration, sort_order AS sortOrder
         FROM album_image WHERE album_id = ? AND is_deleted = 0`,
      [currentId],
    );
    await syncMedia(conn, currentId, existingMedia, input.images, input.videos);

    await recalcTags(conn, [...oldTagIds, ...tagIds]);
    await recalcAuthors(conn, [input.authorId, ...(existing ? [existing.authorId] : [])]);

    return currentId;
  });

  const action = existing
    ? 'album.edit'
    : status === 'published'
      ? 'album.create'
      : 'album.draft';
  await logAdminOp(
    adminId,
    action,
    'album',
    targetId,
    {
      title,
      authorId: input.authorId,
      points,
      status,
      tags: tagIds,
      images: imageCount,
      videos: videoCount,
      packageSize,
    },
    ip,
  );

  return getAdminAlbumDetail(targetId);
}

export async function updateAdminAlbumStatus(
  adminId: number,
  albumId: number,
  status: 'published' | 'offline',
  ip?: string | null,
): Promise<AdminAlbumDetail> {
  const album = await dbClient.queryOne<AdminAlbumDbRow>(
    `SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE a.id = ? AND a.is_deleted = 0 LIMIT 1`,
    [albumId],
  );
  if (!album) {
    throw new HttpError(404, '图集不存在');
  }

  const tagIds = (
    await dbClient.query<{ tagId: number }>(
      `SELECT tag_id AS tagId FROM album_tag WHERE album_id = ?`,
      [albumId],
    )
  ).map((row) => Number(row.tagId));

  await dbClient.transaction(async (conn) => {
    if (status === 'published') {
      const publishedAt = album.status === 'published' ? album.publishedAt : toSqlDateTime();
      await conn.query(
        `UPDATE album SET status = 'published', published_at = ? WHERE id = ?`,
        [publishedAt, albumId],
      );
    } else {
      await conn.query(`UPDATE album SET status = 'offline' WHERE id = ?`, [albumId]);
    }
    await recalcTags(conn, tagIds);
    await recalcAuthors(conn, [album.authorId]);
  });

  const action = status === 'published' ? 'album.publish' : 'album.offline';
  await logAdminOp(adminId, action, 'album', albumId, { title: album.title, status }, ip);
  return getAdminAlbumDetail(albumId);
}

export async function toggleAdminAlbumRecommend(
  adminId: number,
  albumId: number,
  ip?: string | null,
): Promise<{ isRecommended: boolean }> {
  const album = await dbClient.queryOne<{ id: number; title: string; isRecommended: number }>(
    `SELECT id, title, is_recommended AS isRecommended FROM album
      WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [albumId],
  );
  if (!album) {
    throw new HttpError(404, '图集不存在');
  }
  const next = !toBool(album.isRecommended);
  await dbClient.execute(`UPDATE album SET is_recommended = ? WHERE id = ?`, [
    next ? 1 : 0,
    albumId,
  ]);
  await logAdminOp(
    adminId,
    next ? 'album.recommend' : 'album.unrecommend',
    'album',
    albumId,
    { title: album.title, isRecommended: next },
    ip,
  );
  return { isRecommended: next };
}

export async function deleteAdminAlbum(
  adminId: number,
  albumId: number,
  ip?: string | null,
): Promise<void> {
  const album = await dbClient.queryOne<AdminAlbumDbRow>(
    `SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE a.id = ? AND a.is_deleted = 0 LIMIT 1`,
    [albumId],
  );
  if (!album) {
    throw new HttpError(404, '图集不存在');
  }
  const tagIds = (
    await dbClient.query<{ tagId: number }>(
      `SELECT tag_id AS tagId FROM album_tag WHERE album_id = ?`,
      [albumId],
    )
  ).map((row) => Number(row.tagId));

  await dbClient.transaction(async (conn) => {
    await conn.query(`UPDATE album SET is_deleted = 1 WHERE id = ?`, [albumId]);
    await conn.query(`UPDATE album_image SET is_deleted = 1 WHERE album_id = ?`, [albumId]);
    await recalcTags(conn, tagIds);
    await recalcAuthors(conn, [album.authorId]);
  });
  await logAdminOp(adminId, 'album.delete', 'album', albumId, { title: album.title }, ip);
}
