import type { SortType } from '@sylvie/types';

import { placeholders, type SqlFragment, type SqlStatement } from './shared.js';

/**
 * 前台图集 SQL：列表 / 瀑布流 / 详情、媒体预览、收藏、评论与下载。
 * 公开查询统一要求图集 `published` 且未软删除、作者启用且未软删除；
 * 收藏 / 评论等写操作维护 `album.fav_count` / `comment_count` 冗余计数，
 * 评论删除走软删除，关键更新在事务内配合 `FOR UPDATE`。
 */

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

// 列表 / 详情共用列：冗余计数字段（view/fav/comment/download）直接读取，避免实时聚合。
const ALBUM_SELECT = `a.id, a.title, a.description, a.cover_url AS coverUrl, a.image_count AS imageCount,
  a.video_count AS videoCount, a.package_size AS packageSize, a.points,
  a.view_count AS viewCount, a.download_count AS downloadCount, a.fav_count AS favCount,
  a.comment_count AS commentCount, a.is_recommended AS isRecommended, a.status,
  a.published_at AS publishedAt,
  au.id AS authorId, au.name AS authorName, au.initial AS authorInitial, au.color AS authorColor,
  au.avatar_url AS authorAvatarUrl, au.bio AS authorBio, au.album_count AS authorAlbumCount`;

const ALBUM_FROM = `FROM album a JOIN author au ON au.id = a.author_id`;
// 公开可见条件：图集已发布且未软删除，同时其作者启用且未软删除。
const PUBLIC_WHERE = `a.status = 'published' AND a.is_deleted = 0 AND au.status = 1 AND au.is_deleted = 0`;

/**
 * 批量加载图集标签，供卡片渲染。
 * `albumIds` 生成 IN 占位符；仅返回启用、未软删除的标签，按收录数、id 排序。
 */
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

/** 批量加载当前用户在一组图集中的收藏记录，用于标记 `favorited`。 */
export function selectFavoritesForAlbums(
  userId: number,
  albumIds: number[],
): SqlStatement {
  return {
    sql: `SELECT album_id AS albumId FROM favorite WHERE user_id = ? AND album_id IN (${placeholders(albumIds.length)})`,
    params: [userId, ...albumIds],
  };
}

/**
 * 记录图集搜索日志。
 * `userId` 为 undefined（游客）时写 NULL；`resultCount` 为本次命中总数。
 */
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

/**
 * 图集列表动态 WHERE：基础为公开可见条件。
 * - `authorId` 有值时按作者过滤；
 * - `tagName` 有值时要求存在同名启用标签（EXISTS，避免 JOIN 造成重复行）；
 * - `keyword` 有值时匹配标题、作者名 / 别名，或标签名模糊命中。
 */
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

/**
 * 图集列表排序片段（拼接进 ORDER BY，不参与参数化）。
 * `hot` 按浏览量、`fav` 按收藏数，其余按发布时间；都以 id 倒序兜底保证分页稳定。
 */
export function albumListOrder(sort: SortType): string {
  return sort === 'hot'
    ? 'a.view_count DESC, a.published_at DESC, a.id DESC'
    : sort === 'fav'
      ? 'a.fav_count DESC, a.published_at DESC, a.id DESC'
      : 'a.published_at DESC, a.id DESC';
}

/** 统计符合筛选条件的图集总数（分页 total）；`where` 来自 `albumListFilter`。 */
export function countAlbums(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total ${ALBUM_FROM} WHERE ${where.sql}`,
    params: where.params,
  };
}

/**
 * 图集分页列表。
 * `where` 为筛选条件、`order` 为 `albumListOrder` 产出的排序片段；
 * `pageSize` / `offset` 由 service 归一化后传入。
 */
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

/** 瀑布流总数（全部公开可见图集，不区分推荐池）。 */
export function countFeedAlbums(): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total ${ALBUM_FROM} WHERE ${PUBLIC_WHERE}`,
    params: [],
  };
}

/**
 * 瀑布流分页：推荐池优先，登录用户叠加最近浏览标签的偏好分。
 * `prefScore` 子查询取用户最近 100 条浏览记录涉及的标签，统计图集命中的标签数；
 * 游客时固定为 0。排序依次为推荐位、偏好分、浏览量、发布时间。
 */
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

/**
 * 详情页评论列表：返回已审核或当前用户本人的评论（游客传 userId 为 undefined 时
 * 仅返回已审核），未软删除；按创建时间、id 升序，供 service 组装回复树。
 */
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

/** 统计图集已审核评论数（与评论列表展示口径一致，排除软删除）。 */
export function countApprovedAlbumComments(albumId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM comment WHERE album_id = ? AND status = 'approved' AND is_deleted = 0`,
    params: [albumId],
  };
}

/** 全局水印开关（`image.watermark_on`），只影响未解锁预览。 */
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

/** 判断用户是否已永久解锁该图集（详情 / 下载权限判定）。 */
export function countAlbumUnlock(userId: number, albumId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM album_unlock WHERE user_id = ? AND album_id = ?`,
    params: [userId, albumId],
  };
}

/** 判断当前用户是否已收藏该图集（详情返回 `favorited`）。 */
export function countFavorite(userId: number, albumId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM favorite WHERE user_id = ? AND album_id = ?`,
    params: [userId, albumId],
  };
}

/** 判断当前用户是否已订阅该图集作者（详情返回 `subscribed`）。 */
export function countSubscription(userId: number, authorId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM subscription WHERE user_id = ? AND author_id = ?`,
    params: [userId, authorId],
  };
}

/**
 * 全部媒体（已解锁 / 付费会员可见）。
 * 视频排在图片之前，再按 `sort_order`、id 升序；不含软删除媒体。
 */
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

/**
 * 未解锁预览：仅前 `limit` 张图片（调用方传 `FREE_PREVIEW_COUNT`，即前 3 张），
 * 只取 `media_type='image'`，按 sort_order、id 升序。
 */
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

/** 同作者的其他已发布作品（排除当前图集），按发布时间倒序取 5 套。 */
export function selectOtherWorks(authorId: number, albumId: number): SqlStatement {
  return {
    sql: `SELECT ${ALBUM_SELECT} ${ALBUM_FROM}
        WHERE a.author_id = ? AND a.id <> ? AND ${PUBLIC_WHERE}
        ORDER BY a.published_at DESC, a.id DESC
        LIMIT 5`,
    params: [authorId, albumId],
  };
}

/** 浏览量 +1（冗余计数，详情页访问时异步维护，失败不阻断详情）。 */
export function incrementAlbumView(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET view_count = view_count + 1 WHERE id = ?`,
    params: [albumId],
  };
}

/**
 * 写入用户浏览日志，供瀑布流偏好分使用。
 * 游客 `userId` 为 undefined 时写 NULL，`ip` 可为空。
 */
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

/** 校验图集可收藏（存在、已发布且未软删除）。 */
export function selectPublishedAlbumId(albumId: number): SqlStatement {
  return {
    sql: `SELECT id FROM album WHERE id = ? AND status = 'published' AND is_deleted = 0 LIMIT 1`,
    params: [albumId],
  };
}

/**
 * 收藏事务内 `FOR UPDATE` 读取收藏记录。
 * 加锁后据此插入或删除，避免并发切换收藏导致计数错乱。
 */
export function selectFavoriteForUpdate(userId: number, albumId: number): SqlStatement {
  return {
    sql: `SELECT id FROM favorite WHERE user_id = ? AND album_id = ? FOR UPDATE`,
    params: [userId, albumId],
  };
}

/** 取消收藏（物理删除收藏关系），须与 fav_count 扣减在同一事务。 */
export function deleteFavorite(favoriteId: number): SqlStatement {
  return {
    sql: `DELETE FROM favorite WHERE id = ?`,
    params: [favoriteId],
  };
}

/** 收藏数 -1；`GREATEST(..., 0)` 防止脏数据或并发把冗余计数扣成负数。 */
export function decrementAlbumFavCount(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET fav_count = GREATEST(CAST(fav_count AS SIGNED) - 1, 0) WHERE id = ?`,
    params: [albumId],
  };
}

/** 新增收藏关系（同一事务内已加锁确认不存在）。 */
export function insertFavorite(userId: number, albumId: number): SqlStatement {
  return {
    sql: `INSERT INTO favorite (user_id, album_id) VALUES (?, ?)`,
    params: [userId, albumId],
  };
}

/** 收藏数 +1（冗余计数，与插入收藏同事务）。 */
export function incrementAlbumFavCount(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET fav_count = fav_count + 1 WHERE id = ?`,
    params: [albumId],
  };
}

/** 回读图集最新收藏数（切换收藏后返回给前端）。 */
export function selectAlbumFavCount(albumId: number): SqlStatement {
  return {
    sql: `SELECT fav_count AS favCount FROM album WHERE id = ? LIMIT 1`,
    params: [albumId],
  };
}

/** 校验图集可评论（已发布且未软删除），同时返回标题用于通知文案。 */
export function selectPublishedAlbumTitle(albumId: number): SqlStatement {
  return {
    sql: `SELECT id, title FROM album WHERE id = ? AND status = 'published' AND is_deleted = 0 LIMIT 1`,
    params: [albumId],
  };
}

/** 校验回复目标评论存在且未软删除，返回其所属图集与作者。 */
export function selectCommentParent(parentId: number): SqlStatement {
  return {
    sql: `SELECT id, album_id AS albumId, user_id AS userId
         FROM comment WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [parentId],
  };
}

/**
 * 发表评论：新评论状态固定为 `pending`（先审后发），此时不计入 comment_count。
 */
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

/** 评论提交后写入待审核通知（`type='review'`，关联图集）。 */
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

/** 按 id 读取单条评论及用户信息（发表成功后回填返回 DTO）。 */
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

/**
 * 删除事务内 `FOR UPDATE` 加锁读取评论，用于校验归属并计算需扣减的已审核评论数。
 */
export function selectCommentForUpdate(commentId: number): SqlStatement {
  return {
    sql: `SELECT id, user_id AS userId, album_id AS albumId, status, is_deleted AS isDeleted
         FROM comment WHERE id = ? FOR UPDATE`,
    params: [commentId],
  };
}

/** 查询某条评论下未软删除的回复 id，删除父评论时一并软删除。 */
export function selectReplyCommentIds(parentId: number): SqlStatement {
  return {
    sql: `SELECT id FROM comment WHERE parent_id = ? AND is_deleted = 0`,
    params: [parentId],
  };
}

/** 统计待删除评论集合中已审核的数量（只有已审核评论计入过 comment_count）。 */
export function countApprovedCommentsByIds(ids: number[]): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM comment WHERE id IN (${placeholders(ids.length)}) AND status = 'approved'`,
    params: ids,
  };
}

/** 软删除评论：状态置 `deleted` 且 `is_deleted = 1`，不做物理删除。 */
export function softDeleteCommentsByIds(ids: number[]): SqlStatement {
  return {
    sql: `UPDATE comment SET status = 'deleted', is_deleted = 1 WHERE id IN (${placeholders(ids.length)})`,
    params: ids,
  };
}

/** 评论数扣减 `count`；`GREATEST(..., 0)` 保证冗余计数不为负。 */
export function decrementAlbumCommentCount(albumId: number, count: number): SqlStatement {
  return {
    sql: `UPDATE album SET comment_count = GREATEST(CAST(comment_count AS SIGNED) - ?, 0) WHERE id = ?`,
    params: [count, albumId],
  };
}

/** 按 ID 批量取公开可见图集，供收藏 / 解锁 / 购买列表复用卡片数据。 */
export function selectAlbumsByIds(albumIds: number[]): SqlStatement {
  return {
    sql: `SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE a.id IN (${placeholders(albumIds.length)}) AND ${PUBLIC_WHERE}`,
    params: albumIds,
  };
}

/** 我的收藏总数（仅统计仍公开可见的图集，与列表口径一致）。 */
export function countFavoriteAlbums(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM favorite f
       JOIN album a ON a.id = f.album_id
       JOIN author au ON au.id = a.author_id
      WHERE f.user_id = ? AND ${PUBLIC_WHERE}`,
    params: [userId],
  };
}

/** 我的收藏分页：仅返回公开可见图集 id，按收藏时间、收藏 id 倒序。 */
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

/** 可下载图集信息（标题 + 作者名），用于生成 ZIP 文件名。 */
export function selectAlbumForDownload(albumId: number): SqlStatement {
  return {
    sql: `SELECT a.id, a.title, au.name AS authorName
       FROM album a JOIN author au ON au.id = a.author_id
      WHERE a.id = ? AND ${PUBLIC_WHERE} LIMIT 1`,
    params: [albumId],
  };
}

/** 下载用原图 URL 列表（仅图片，不含视频，排除软删除，按 sort_order 排序）。 */
/** 下载打包用的媒体行：图片与视频都参与，按展示顺序输出。 */
export interface DownloadMediaRow {
  url: string;
  mediaType: 'image' | 'video';
}

export function selectDownloadMediaUrls(albumId: number): SqlStatement {
  return {
    sql: `SELECT url, media_type AS mediaType FROM album_image
      WHERE album_id = ? AND is_deleted = 0
      ORDER BY sort_order ASC, id ASC`,
    params: [albumId],
  };
}

/** 下载次数 +1（冗余计数，下载开始后维护，失败不阻断下载）。 */
export function incrementAlbumDownloadCount(albumId: number): SqlStatement {
  return {
    sql: `UPDATE album SET download_count = download_count + 1 WHERE id = ?`,
    params: [albumId],
  };
}

/** 写入下载日志（按日期归档），仅登录用户下载时记录。 */
export function insertDownloadLog(userId: number, albumId: number): SqlStatement {
  return {
    sql: `INSERT INTO download_log (user_id, album_id, download_date) VALUES (?, ?, CURDATE())`,
    params: [userId, albumId],
  };
}
