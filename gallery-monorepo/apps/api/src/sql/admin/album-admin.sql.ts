import type { AdminAlbumStatus } from '@sylvie/types';

import { placeholders, type SqlFragment, type SqlStatement } from '../shared.js';

/** 后台图集列表 / 详情行。 */
export interface AdminAlbumDbRow {
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

/** 图集媒体行。 */
export interface MediaDbRow {
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

/** 图集关联标签行。 */
export interface AlbumTagRow {
  id: number;
  name: string;
  useCount: number;
}

/** 图集标签关联行。 */
export interface AlbumTagIdRow {
  tagId: number;
}

const ALBUM_SELECT = `a.id, a.title, a.description, a.cover_url AS coverUrl,
  a.image_count AS imageCount, a.video_count AS videoCount, a.package_size AS packageSize,
  a.points, a.view_count AS viewCount, a.fav_count AS favCount,
  a.is_recommended AS isRecommended, a.status, a.published_at AS publishedAt,
  a.created_at AS createdAt,
  au.id AS authorId, au.name AS authorName, au.initial AS authorInitial,
  au.color AS authorColor, au.avatar_url AS authorAvatarUrl`;
const ALBUM_FROM = `FROM album a JOIN author au ON au.id = a.author_id`;

/** 后台图集列表筛选：状态 + 标题/作者关键字。 */
export function buildAdminAlbumWhere(query: {
  status?: string;
  keyword?: string;
}): SqlFragment {
  const conditions = ['a.is_deleted = 0'];
  const params: unknown[] = [];
  const status = query.status;
  const keyword = query.keyword?.trim().slice(0, 64) ?? '';

  if (status === 'published' || status === 'draft' || status === 'offline') {
    conditions.push('a.status = ?');
    params.push(status);
  }
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(a.title LIKE ? OR au.name LIKE ?)');
    params.push(like, like);
  }

  return { sql: conditions.join(' AND '), params };
}

/** 后台图集总数。 */
export function countAdminAlbums(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total ${ALBUM_FROM} WHERE ${where.sql}`,
    params: where.params,
  };
}

/** 后台图集分页列表。 */
export function selectAdminAlbums(
  where: SqlFragment,
  pageSize: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT ${ALBUM_SELECT} ${ALBUM_FROM}
      WHERE ${where.sql}
      ORDER BY COALESCE(a.published_at, a.created_at) DESC, a.id DESC
      LIMIT ? OFFSET ?`,
    params: [...where.params, pageSize, offset],
  };
}

/** 后台图集详情（含编辑前读取）。 */
export function selectAdminAlbumDetail(albumId: number): SqlStatement {
  return {
    sql: `SELECT ${ALBUM_SELECT} ${ALBUM_FROM}
      WHERE a.id = ? AND a.is_deleted = 0
      LIMIT 1`,
    params: [albumId],
  };
}

/** 图集关联的标签。 */
export function selectAdminAlbumTags(albumId: number): SqlStatement {
  return {
    sql: `SELECT t.id, t.name, t.use_count AS useCount
         FROM album_tag at JOIN tag t ON t.id = at.tag_id
        WHERE at.album_id = ? AND t.is_deleted = 0
        ORDER BY t.use_count DESC, t.id ASC`,
    params: [albumId],
  };
}

/** 图集详情媒体（按排序展示）。 */
export function selectAdminAlbumMedia(albumId: number): SqlStatement {
  return {
    sql: `SELECT id, media_type AS mediaType, url, thumb_url AS thumbUrl,
              watermark_url AS watermarkUrl, width, height, duration, sort_order AS sortOrder
         FROM album_image
        WHERE album_id = ? AND is_deleted = 0
        ORDER BY sort_order ASC, id ASC`,
    params: [albumId],
  };
}

/** 保存图集时读取现有媒体（不排序）。 */
export function selectAdminAlbumMediaForSync(albumId: number): SqlStatement {
  return {
    sql: `SELECT id, media_type AS mediaType, url, thumb_url AS thumbUrl,
              watermark_url AS watermarkUrl, width, height, duration, sort_order AS sortOrder
         FROM album_image WHERE album_id = ? AND is_deleted = 0`,
    params: [albumId],
  };
}

/** 图集当前关联的标签 ID。 */
export function selectAlbumTagIds(albumId: number): SqlStatement {
  return {
    sql: `SELECT tag_id AS tagId FROM album_tag WHERE album_id = ?`,
    params: [albumId],
  };
}

/** 保存图集时校验归属作者。 */
export function selectAuthorForAlbum(authorId: number): SqlStatement {
  return {
    sql: `SELECT id, status FROM author WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [authorId],
  };
}

/** 保存图集时校验标签有效性。 */
export function selectValidTagIds(tagIds: number[]): SqlStatement {
  return {
    sql: `SELECT id FROM tag WHERE id IN (${placeholders(tagIds.length)}) AND is_deleted = 0`,
    params: tagIds,
  };
}

/** 新图集插入字段。 */
export interface AlbumInsertValues {
  authorId: number;
  title: string;
  description: string | null;
  coverUrl: string;
  imageCount: number;
  videoCount: number;
  packageSize: number;
  points: number;
  status: AdminAlbumStatus;
  publishedAt: string | null;
  adminId: number;
}

/** 新建图集。 */
export function insertAdminAlbum(values: AlbumInsertValues): SqlStatement {
  return {
    sql: `INSERT INTO album (author_id, title, description, cover_url, image_count, video_count,
           package_size, points, status, published_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      values.authorId,
      values.title,
      values.description,
      values.coverUrl,
      values.imageCount,
      values.videoCount,
      values.packageSize,
      values.points,
      values.status,
      values.publishedAt,
      values.adminId,
    ],
  };
}

/** 编辑图集更新字段。 */
export interface AlbumUpdateValues {
  authorId: number;
  title: string;
  description: string | null;
  coverUrl: string;
  imageCount: number;
  videoCount: number;
  packageSize: number;
  points: number;
  status: AdminAlbumStatus;
  publishedAt: string | null;
  albumId: number;
}

/** 更新图集。 */
export function updateAdminAlbum(values: AlbumUpdateValues): SqlStatement {
  return {
    sql: `UPDATE album SET author_id = ?, title = ?, description = ?, cover_url = ?,
                image_count = ?, video_count = ?, package_size = ?, points = ?,
                status = ?, published_at = ?
          WHERE id = ?`,
    params: [
      values.authorId,
      values.title,
      values.description,
      values.coverUrl,
      values.imageCount,
      values.videoCount,
      values.packageSize,
      values.points,
      values.status,
      values.publishedAt,
      values.albumId,
    ],
  };
}

/** 清空图集标签关联。 */
export function deleteAlbumTags(albumId: number): SqlStatement {
  return {
    sql: `DELETE FROM album_tag WHERE album_id = ?`,
    params: [albumId],
  };
}

/** 新增图集标签关联。 */
export function insertAlbumTag(albumId: number, tagId: number): SqlStatement {
  return {
    sql: `INSERT INTO album_tag (album_id, tag_id) VALUES (?, ?)`,
    params: [albumId, tagId],
  };
}

/** 媒体更新 / 新增的公共字段。 */
export interface AlbumMediaValues {
  mediaType: 'image' | 'video';
  url: string;
  thumbUrl: string | null;
  watermarkUrl: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  sortOrder: number;
}

/** 更新既有媒体。 */
export function updateAlbumImage(
  values: AlbumMediaValues & { id: number; albumId: number },
): SqlStatement {
  return {
    sql: `UPDATE album_image SET media_type = ?, url = ?, thumb_url = ?, watermark_url = ?,
                  width = ?, height = ?, duration = ?, sort_order = ?, is_deleted = 0
            WHERE id = ? AND album_id = ?`,
    params: [
      values.mediaType,
      values.url,
      values.thumbUrl,
      values.watermarkUrl,
      values.width,
      values.height,
      values.duration,
      values.sortOrder,
      values.id,
      values.albumId,
    ],
  };
}

/** 新增媒体。 */
export function insertAlbumImage(values: AlbumMediaValues & { albumId: number }): SqlStatement {
  return {
    sql: `INSERT INTO album_image (album_id, media_type, url, thumb_url, watermark_url,
             width, height, duration, sort_order, is_deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    params: [
      values.albumId,
      values.mediaType,
      values.url,
      values.thumbUrl,
      values.watermarkUrl,
      values.width,
      values.height,
      values.duration,
      values.sortOrder,
    ],
  };
}

/** 软删除已移除的媒体。 */
export function softDeleteStaleAlbumImages(albumId: number, staleIds: number[]): SqlStatement {
  return {
    sql: `UPDATE album_image SET is_deleted = 1 WHERE album_id = ? AND id IN (${placeholders(
      staleIds.length,
    )})`,
    params: [albumId, ...staleIds],
  };
}

/** 重算标签收录数（仅统计已发布且未删除图集）。 */
export function recalcTagUseCount(tagIds: number[]): SqlStatement {
  return {
    sql: `UPDATE tag t SET use_count = (
       SELECT COUNT(*) FROM album_tag at
       JOIN album a ON a.id = at.album_id AND a.status = 'published' AND a.is_deleted = 0
       WHERE at.tag_id = t.id
     ) WHERE t.id IN (${placeholders(tagIds.length)})`,
    params: tagIds,
  };
}

/** 重算作者图集数与最近更新时间。 */
export function recalcAuthorStats(authorId: number): SqlStatement {
  return {
    sql: `UPDATE author a SET
         album_count = (SELECT COUNT(*) FROM album al
           WHERE al.author_id = a.id AND al.status = 'published' AND al.is_deleted = 0),
         last_update_at = (SELECT MAX(al.published_at) FROM album al
           WHERE al.author_id = a.id AND al.status = 'published' AND al.is_deleted = 0)
       WHERE a.id = ?`,
    params: [authorId],
  };
}

/** 发布图集。 */
export function publishAdminAlbum(publishedAt: string | null, albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET status = 'published', published_at = ? WHERE id = ?`,
    params: [publishedAt, albumId],
  };
}

/** 下架图集。 */
export function offlineAdminAlbum(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET status = 'offline' WHERE id = ?`,
    params: [albumId],
  };
}

/** 推荐开关读取。 */
export function selectAdminAlbumRecommend(albumId: number): SqlStatement {
  return {
    sql: `SELECT id, title, is_recommended AS isRecommended FROM album
      WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [albumId],
  };
}

/** 设置推荐状态。 */
export function updateAdminAlbumRecommend(value: number, albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET is_recommended = ? WHERE id = ?`,
    params: [value, albumId],
  };
}

/** 软删除图集。 */
export function softDeleteAdminAlbum(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET is_deleted = 1 WHERE id = ?`,
    params: [albumId],
  };
}

/** 软删除图集下全部媒体。 */
export function softDeleteAlbumImages(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album_image SET is_deleted = 1 WHERE album_id = ?`,
    params: [albumId],
  };
}
