import type { SortType } from '@sylvie/types';

import { placeholders, type SqlFragment, type SqlStatement } from './shared.js';

/** 图集行：列表 / 详情共用。 */
export interface AlbumRow {
  id: number;
  title: string;
  description: string | null;
  coverUrl: string;
  imageCount: number;
  videoCount: number;
  packageSize: string | number;
  points: number;
  viewCount: number;
  downloadCount: number;
  favCount: number;
  commentCount: number;
  isRecommended: number;
  status: 'draft' | 'published' | 'offline';
  publishedAt: string | null;
  authorId: number;
  authorName: string;
  authorInitial: string;
  authorColor: string;
  authorAvatarUrl: string | null;
  authorBio: string | null;
  authorAlbumCount: number;
}

/** 图集标签行。 */
export interface AlbumTagRow {
  albumId: number;
  id: number;
  name: string;
  useCount: number;
}

/** 图集媒体行。 */
export interface AlbumImageRow {
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

/** 图集评论行。 */
export interface AlbumCommentRow {
  id: number;
  parentId: number | null;
  replyToUserId: number | null;
  replyToName: string | null;
  content: string;
  status: 'pending' | 'approved' | 'rejected' | 'deleted';
  createdAt: string;
  userId: number;
  nickname: string;
  avatarType: number;
  avatarIndex: number;
  avatarUrl: string | null;
  role: 'member' | 'vip' | 'admin';
  vipExpireAt: string | null;
}

const ALBUM_SELECT = `a.id, a.title, a.description, a.cover_url AS coverUrl, a.image_count AS imageCount,
  a.video_count AS videoCount, a.package_size AS packageSize, a.points,
  a.view_count AS viewCount, a.download_count AS downloadCount, a.fav_count AS favCount,
  a.comment_count AS commentCount, a.is_recommended AS isRecommended, a.status,
  a.published_at AS publishedAt,
  au.id AS authorId, au.name AS authorName, au.initial AS authorInitial, au.color AS authorColor,
  au.avatar_url AS authorAvatarUrl, au.bio AS authorBio, au.album_count AS authorAlbumCount`;

const ALBUM_FROM = `FROM album a JOIN author au ON au.id = a.author_id`;
const PUBLIC_WHERE = `a.status = 'published' AND a.is_deleted = 0 AND au.status = 1 AND au.is_deleted = 0`;

/** 批量加载图集标签。 */
export function selectAlbumTags(albumIds: number[]): SqlStatement {
  return {
    sql: `SELECT at.album_id AS albumId, t.id, t.name, t.use_count AS useCount
       FROM album_tag at
       JOIN tag t ON t.id = at.tag_id
      WHERE at.album_id IN (${placeholders(albumIds.length)}) AND t.status = 1 AND t.is_deleted = 0
      ORDER BY t.use_count DESC, t.id ASC`,
    params: albumIds,
  };
}

/** 批量加载当前用户已收藏的图集 ID。 */
export function selectFavoritesForAlbums(
  userId: number,
  albumIds: number[],
): SqlStatement {
  return {
    sql: `SELECT album_id AS albumId FROM favorite WHERE user_id = ? AND album_id IN (${placeholders(albumIds.length)})`,
    params: [userId, ...albumIds],
  };
}

/** 记录图集搜索日志。 */
export function insertAlbumSearchLog(
  keyword: string,
  userId: number | undefined,
  resultCount: number,
): SqlStatement {
  return {
    sql: `INSERT INTO search_log (scene, keyword, user_id, result_count, search_date)
       VALUES ('album', ?, ?, ?, CURDATE())`,
    params: [keyword, userId ?? null, resultCount],
  };
}

/** 图集列表动态 WHERE：作者、标签、关键词筛选。 */
export function albumListFilter(input: {
  authorId?: number;
  tagName: string;
  keyword: string;
}): SqlFragment {
  const conditions = [PUBLIC_WHERE];
  const params: unknown[] = [];

  if (input.authorId) {
    conditions.push('a.author_id = ?');
    params.push(input.authorId);
  }

  if (input.tagName) {
    conditions.push(
      `EXISTS (SELECT 1 FROM album_tag at JOIN tag t ON t.id = at.tag_id
                WHERE at.album_id = a.id AND t.name = ? AND t.status = 1 AND t.is_deleted = 0)`,
    );
    params.push(input.tagName);
  }

  if (input.keyword) {
    const like = `%${input.keyword}%`;
    conditions.push(
      `(a.title LIKE ? OR au.name LIKE ? OR au.alias LIKE ?
        OR EXISTS (SELECT 1 FROM album_tag at2 JOIN tag t2 ON t2.id = at2.tag_id
                    WHERE at2.album_id = a.id AND t2.name LIKE ? AND t2.status = 1 AND t2.is_deleted = 0))`,
    );
    params.push(like, like, like, like);
  }

  return { sql: conditions.join(' AND '), params };
}

/** 图集列表排序片段。 */
export function albumListOrder(sort: SortType): string {
  return sort === 'hot'
    ? 'a.view_count DESC, a.published_at DESC, a.id DESC'
    : sort === 'fav'
      ? 'a.fav_count DESC, a.published_at DESC, a.id DESC'
      : 'a.published_at DESC, a.id DESC';
}

export function countAlbums(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total ${ALBUM_FROM} WHERE ${where.sql}`,
    params: where.params,
  };
}

export function selectAlbumsPage(
  where: SqlFragment,
  order: string,
  pageSize: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE ${where.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    params: [...where.params, pageSize, offset],
  };
}

/** 瀑布流总数。 */
export function countFeedAlbums(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total ${ALBUM_FROM} WHERE ${PUBLIC_WHERE}`,
    params: [],
  };
}

/** 瀑布流分页：推荐池优先，登录用户叠加最近浏览标签的偏好分。 */
export function selectFeedAlbums(
  userId: number | undefined,
  pageSize: number,
  offset: number,
): SqlStatement {
  const prefScore = userId
    ? `(SELECT COUNT(*) FROM album_tag pt
         JOIN (SELECT at2.tag_id
                 FROM user_view_log v
                 JOIN album_tag at2 ON at2.album_id = v.album_id
                WHERE v.user_id = ?
                GROUP BY at2.tag_id
                ORDER BY MAX(v.id) DESC
                LIMIT 100) pref ON pref.tag_id = pt.tag_id
         WHERE pt.album_id = a.id)`
    : '0';
  const params: unknown[] = userId ? [userId] : [];

  return {
    sql: `SELECT ${ALBUM_SELECT}, ${prefScore} AS prefScore
       ${ALBUM_FROM}
      WHERE ${PUBLIC_WHERE}
      ORDER BY a.is_recommended DESC, prefScore DESC, a.view_count DESC, a.published_at DESC
      LIMIT ? OFFSET ?`,
    params: [...params, pageSize, offset],
  };
}

/** 详情页评论列表：已审核或本人评论。 */
export function selectAlbumComments(
  albumId: number,
  userId: number | undefined,
): SqlStatement {
  return {
    sql: `SELECT c.id, c.parent_id AS parentId, c.reply_to_user_id AS replyToUserId,
            ru.nickname AS replyToName, c.content, c.status, c.created_at AS createdAt,
            u.id AS userId, u.nickname, u.avatar_type AS avatarType, u.avatar_index AS avatarIndex,
            u.avatar_url AS avatarUrl, u.role, u.vip_expire_at AS vipExpireAt
       FROM comment c
       JOIN \`user\` u ON u.id = c.user_id
       LEFT JOIN \`user\` ru ON ru.id = c.reply_to_user_id
      WHERE c.album_id = ? AND c.is_deleted = 0 AND (c.status = 'approved' OR c.user_id = ?)
      ORDER BY c.created_at ASC, c.id ASC`,
    params: [albumId, userId ?? 0],
  };
}

export function countApprovedAlbumComments(albumId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM comment WHERE album_id = ? AND status = 'approved' AND is_deleted = 0`,
    params: [albumId],
  };
}

/** 全局水印开关。 */
export function selectWatermarkConfig(): SqlStatement {
  return {
    sql: `SELECT config_value AS value FROM sys_config WHERE config_key = 'image.watermark_on' LIMIT 1`,
    params: [],
  };
}

/** 已发布图集详情。 */
export function selectPublishedAlbum(albumId: number): SqlStatement {
  return {
    sql: `SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE a.id = ? AND ${PUBLIC_WHERE} LIMIT 1`,
    params: [albumId],
  };
}

export function countAlbumUnlock(userId: number, albumId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM album_unlock WHERE user_id = ? AND album_id = ?`,
    params: [userId, albumId],
  };
}

export function countFavorite(userId: number, albumId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM favorite WHERE user_id = ? AND album_id = ?`,
    params: [userId, albumId],
  };
}

export function countSubscription(userId: number, authorId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM subscription WHERE user_id = ? AND author_id = ?`,
    params: [userId, authorId],
  };
}

/** 全部媒体：视频优先。 */
export function selectAlbumImages(albumId: number): SqlStatement {
  return {
    sql: `SELECT id, media_type AS mediaType, url, thumb_url AS thumbUrl, watermark_url AS watermarkUrl,
                width, height, duration, sort_order AS sortOrder
           FROM album_image
          WHERE album_id = ? AND is_deleted = 0
          ORDER BY (media_type = 'video') DESC, sort_order ASC, id ASC`,
    params: [albumId],
  };
}

/** 未解锁预览：仅前 N 张图片。 */
export function selectPreviewAlbumImages(albumId: number, limit: number): SqlStatement {
  return {
    sql: `SELECT id, media_type AS mediaType, url, thumb_url AS thumbUrl, watermark_url AS watermarkUrl,
                width, height, duration, sort_order AS sortOrder
           FROM album_image
          WHERE album_id = ? AND is_deleted = 0 AND media_type = 'image'
          ORDER BY sort_order ASC, id ASC
          LIMIT ?`,
    params: [albumId, limit],
  };
}

/** 同作者的其他作品。 */
export function selectOtherWorks(authorId: number, albumId: number): SqlStatement {
  return {
    sql: `SELECT ${ALBUM_SELECT} ${ALBUM_FROM}
        WHERE a.author_id = ? AND a.id <> ? AND ${PUBLIC_WHERE}
        ORDER BY a.published_at DESC, a.id DESC
        LIMIT 5`,
    params: [authorId, albumId],
  };
}

export function incrementAlbumView(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET view_count = view_count + 1 WHERE id = ?`,
    params: [albumId],
  };
}

export function insertUserViewLog(
  userId: number | undefined,
  albumId: number,
  ip: string | undefined,
): SqlStatement {
  return {
    sql: `INSERT INTO user_view_log (user_id, album_id, view_date, ip) VALUES (?, ?, CURDATE(), ?)`,
    params: [userId ?? null, albumId, ip ?? null],
  };
}

/** 可收藏的已发布图集。 */
export function selectPublishedAlbumId(albumId: number): SqlStatement {
  return {
    sql: `SELECT id FROM album WHERE id = ? AND status = 'published' AND is_deleted = 0 LIMIT 1`,
    params: [albumId],
  };
}

export function selectFavoriteForUpdate(userId: number, albumId: number): SqlStatement {
  return {
    sql: `SELECT id FROM favorite WHERE user_id = ? AND album_id = ? FOR UPDATE`,
    params: [userId, albumId],
  };
}

export function deleteFavorite(favoriteId: number): SqlStatement {
  return {
    sql: `DELETE FROM favorite WHERE id = ?`,
    params: [favoriteId],
  };
}

export function decrementAlbumFavCount(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET fav_count = GREATEST(CAST(fav_count AS SIGNED) - 1, 0) WHERE id = ?`,
    params: [albumId],
  };
}

export function insertFavorite(userId: number, albumId: number): SqlStatement {
  return {
    sql: `INSERT INTO favorite (user_id, album_id) VALUES (?, ?)`,
    params: [userId, albumId],
  };
}

export function incrementAlbumFavCount(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET fav_count = fav_count + 1 WHERE id = ?`,
    params: [albumId],
  };
}

export function selectAlbumFavCount(albumId: number): SqlStatement {
  return {
    sql: `SELECT fav_count AS favCount FROM album WHERE id = ? LIMIT 1`,
    params: [albumId],
  };
}

/** 可评论的已发布图集（含标题）。 */
export function selectPublishedAlbumTitle(albumId: number): SqlStatement {
  return {
    sql: `SELECT id, title FROM album WHERE id = ? AND status = 'published' AND is_deleted = 0 LIMIT 1`,
    params: [albumId],
  };
}

export function selectCommentParent(parentId: number): SqlStatement {
  return {
    sql: `SELECT id, album_id AS albumId, user_id AS userId
         FROM comment WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [parentId],
  };
}

export function insertComment(input: {
  albumId: number;
  userId: number;
  parentId: number | null;
  replyToUserId: number | null;
  content: string;
}): SqlStatement {
  return {
    sql: `INSERT INTO comment (album_id, user_id, parent_id, reply_to_user_id, content, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    params: [
      input.albumId,
      input.userId,
      input.parentId,
      input.replyToUserId,
      input.content,
    ],
  };
}

export function insertReviewNotification(
  userId: number,
  content: string,
  albumId: number,
): SqlStatement {
  return {
    sql: `INSERT INTO user_notification (user_id, type, title, content, album_id)
     VALUES (?, 'review', '你的评论已提交审核', ?, ?)`,
    params: [userId, content, albumId],
  };
}

export function selectCommentById(commentId: number): SqlStatement {
  return {
    sql: `SELECT c.id, c.parent_id AS parentId, c.reply_to_user_id AS replyToUserId,
            ru.nickname AS replyToName, c.content, c.status, c.created_at AS createdAt,
            u.id AS userId, u.nickname, u.avatar_type AS avatarType, u.avatar_index AS avatarIndex,
            u.avatar_url AS avatarUrl, u.role, u.vip_expire_at AS vipExpireAt
       FROM comment c
       JOIN \`user\` u ON u.id = c.user_id
       LEFT JOIN \`user\` ru ON ru.id = c.reply_to_user_id
      WHERE c.id = ? LIMIT 1`,
    params: [commentId],
  };
}

export function selectCommentForUpdate(commentId: number): SqlStatement {
  return {
    sql: `SELECT id, user_id AS userId, album_id AS albumId, status, is_deleted AS isDeleted
         FROM comment WHERE id = ? FOR UPDATE`,
    params: [commentId],
  };
}

export function selectReplyCommentIds(parentId: number): SqlStatement {
  return {
    sql: `SELECT id FROM comment WHERE parent_id = ? AND is_deleted = 0`,
    params: [parentId],
  };
}

export function countApprovedCommentsByIds(ids: number[]): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM comment WHERE id IN (${placeholders(ids.length)}) AND status = 'approved'`,
    params: ids,
  };
}

export function softDeleteCommentsByIds(ids: number[]): SqlStatement {
  return {
    sql: `UPDATE comment SET status = 'deleted', is_deleted = 1 WHERE id IN (${placeholders(ids.length)})`,
    params: ids,
  };
}

export function decrementAlbumCommentCount(albumId: number, count: number): SqlStatement {
  return {
    sql: `UPDATE album SET comment_count = GREATEST(CAST(comment_count AS SIGNED) - ?, 0) WHERE id = ?`,
    params: [count, albumId],
  };
}

/** 按 ID 批量取已发布图集。 */
export function selectAlbumsByIds(albumIds: number[]): SqlStatement {
  return {
    sql: `SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE a.id IN (${placeholders(albumIds.length)}) AND ${PUBLIC_WHERE}`,
    params: albumIds,
  };
}

/** 我的收藏总数。 */
export function countFavoriteAlbums(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM favorite f
       JOIN album a ON a.id = f.album_id
       JOIN author au ON au.id = a.author_id
      WHERE f.user_id = ? AND ${PUBLIC_WHERE}`,
    params: [userId],
  };
}

/** 我的收藏分页：按收藏时间倒序。 */
export function selectFavoriteAlbumIds(
  userId: number,
  pageSize: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT f.album_id AS albumId
       FROM favorite f
       JOIN album a ON a.id = f.album_id
       JOIN author au ON au.id = a.author_id
      WHERE f.user_id = ? AND ${PUBLIC_WHERE}
      ORDER BY f.created_at DESC, f.id DESC
      LIMIT ? OFFSET ?`,
    params: [userId, pageSize, offset],
  };
}

/** 可下载图集信息。 */
export function selectAlbumForDownload(albumId: number): SqlStatement {
  return {
    sql: `SELECT a.id, a.title, au.name AS authorName
       FROM album a JOIN author au ON au.id = a.author_id
      WHERE a.id = ? AND ${PUBLIC_WHERE} LIMIT 1`,
    params: [albumId],
  };
}

/** 下载用原图列表。 */
export function selectDownloadImageUrls(albumId: number): SqlStatement {
  return {
    sql: `SELECT url FROM album_image
      WHERE album_id = ? AND media_type = 'image' AND is_deleted = 0
      ORDER BY sort_order ASC, id ASC`,
    params: [albumId],
  };
}

export function incrementAlbumDownloadCount(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET download_count = download_count + 1 WHERE id = ?`,
    params: [albumId],
  };
}

export function insertDownloadLog(userId: number, albumId: number): SqlStatement {
  return {
    sql: `INSERT INTO download_log (user_id, album_id, download_date) VALUES (?, ?, CURDATE())`,
    params: [userId, albumId],
  };
}
