/**
 * 后台图集的参数化 SQL：列表 / 详情、保存所需的标签与媒体读写、发布状态、推荐开关、软删除，
 * 以及标签收录数、作者图集数的冗余字段重算。
 *
 * 所有函数返回 { sql, params }，不在此层开启事务，由 service 决定事务边界。
 */
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

/**
 * 构建后台图集列表的 WHERE 片段。
 *
 * - 固定条件：`a.is_deleted = 0`（软删除图集不参与列表）；
 * - status 仅接受 published / draft / offline，其他值忽略；
 * - keyword 去空白并截断到 64 字符，在标题与作者名中做 LIKE 匹配（% 通配）。
 */
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

/**
 * 后台图集分页列表。
 *
 * 按 COALESCE(published_at, created_at) 倒序（未发布图集按创建时间参与排序），同时间再按 id 倒序；
 * pageSize / offset 由调用方计算。
 */
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

/**
 * 校验标签有效性：仅返回未软删除且 ID 命中传入列表的记录。
 * IN 占位符按 tagIds.length 动态生成；调用方比对返回行数与入参数量是否一致。
 */
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

/**
 * 软删除表单中已移除的既有媒体：限定 album_id 且 id 命中 staleIds。
 * IN 占位符按数量动态生成，空列表不会进入此处（由 service 判断）。
 */
export function softDeleteStaleAlbumImages(albumId: number, staleIds: number[]): SqlStatement {
  return {
    sql: `UPDATE album_image SET is_deleted = 1 WHERE album_id = ? AND id IN (${placeholders(
      staleIds.length,
    )})`,
    params: [albumId, ...staleIds],
  };
}

/**
 * 重算标签收录数（冗余字段 tag.use_count）。
 *
 * 只统计关联图集中 status = 'published' 且未软删除的数量，因此图集发布 / 下架 / 删除、
 * 标签关联变更后都必须调用。批量限定 tagIds，IN 占位符按数量生成。
 */
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

/**
 * 重算作者图集数（author.album_count）与最近更新时间（last_update_at）。
 *
 * 两者都只统计该作者 status = 'published' 且未软删除的图集；无已发布图集时
 * last_update_at 会被置为 NULL。
 */
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

/** 发布图集：写入 published（发布时间由 service 决定，首次发布为新时间，重复发布保留原值）。 */
export function publishAdminAlbum(publishedAt: string | null, albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET status = 'published', published_at = ? WHERE id = ?`,
    params: [publishedAt, albumId],
  };
}

/** 下架图集：status 置 offline，保留 published_at 以便重新发布时沿用。 */
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

/** 设置推荐状态：value 为 1 进入推荐池，0 移出推荐池。 */
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
