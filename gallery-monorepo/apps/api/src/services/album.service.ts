import { Readable } from 'node:stream';

import archiver from 'archiver';

import {
  FREE_PREVIEW_COUNT,
  type AlbumCardDto,
  type AlbumDetailDto,
  type AlbumImageDto,
  type CommentDto,
  type CommentUserDto,
  type EffectiveRole,
  type PageResult,
  type SortType,
} from '@sylvie/types';

import { dbClient, queryOn, queryOneOn, type TransactionConnection } from '../db/index.js';
import type { AuthUser } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { effectiveRole, normalizePage, toBool, toNumber, toPageResult } from '../utils/format.js';
import { moduleLogger } from '../utils/logger.js';
import { isVipUser } from './user.service.js';

const log = moduleLogger('album');

interface AlbumRow {
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

interface TagRow {
  albumId: number;
  id: number;
  name: string;
  useCount: number;
}

interface ImageRow {
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

interface CommentRow {
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

function mapAlbumCard(row: AlbumRow, tags: TagRow[], favorited: boolean): AlbumCardDto {
  return {
    id: Number(row.id),
    title: row.title,
    coverUrl: row.coverUrl,
    imageCount: Number(row.imageCount),
    videoCount: Number(row.videoCount),
    packageSize: toNumber(row.packageSize),
    points: Number(row.points),
    viewCount: Number(row.viewCount),
    favCount: Number(row.favCount),
    commentCount: Number(row.commentCount),
    isRecommended: toBool(row.isRecommended),
    publishedAt: row.publishedAt ?? '',
    author: {
      id: Number(row.authorId),
      name: row.authorName,
      initial: row.authorInitial,
      color: row.authorColor,
      avatarUrl: row.authorAvatarUrl,
    },
    tags: tags.map((tag) => ({
      id: Number(tag.id),
      name: tag.name,
      useCount: Number(tag.useCount),
    })),
    favorited,
  };
}

async function loadTags(albumIds: number[]): Promise<Map<number, TagRow[]>> {
  const map = new Map<number, TagRow[]>();
  if (albumIds.length === 0) {
    return map;
  }
  const placeholders = albumIds.map(() => '?').join(', ');
  const rows = await dbClient.query<TagRow>(
    `SELECT at.album_id AS albumId, t.id, t.name, t.use_count AS useCount
       FROM album_tag at
       JOIN tag t ON t.id = at.tag_id
      WHERE at.album_id IN (${placeholders}) AND t.status = 1 AND t.is_deleted = 0
      ORDER BY t.use_count DESC, t.id ASC`,
    albumIds,
  );
  for (const row of rows) {
    const list = map.get(Number(row.albumId)) ?? [];
    list.push(row);
    map.set(Number(row.albumId), list);
  }
  return map;
}

async function loadFavorites(userId: number | undefined, albumIds: number[]): Promise<Set<number>> {
  if (!userId || albumIds.length === 0) {
    return new Set();
  }
  const placeholders = albumIds.map(() => '?').join(', ');
  const rows = await dbClient.query<{ albumId: number }>(
    `SELECT album_id AS albumId FROM favorite WHERE user_id = ? AND album_id IN (${placeholders})`,
    [userId, ...albumIds],
  );
  return new Set(rows.map((row) => Number(row.albumId)));
}

async function buildAlbumCards(rows: AlbumRow[], userId?: number): Promise<AlbumCardDto[]> {
  const ids = rows.map((row) => Number(row.id));
  const [tagMap, favoriteSet] = await Promise.all([loadTags(ids), loadFavorites(userId, ids)]);
  return rows.map((row) =>
    mapAlbumCard(row, tagMap.get(Number(row.id)) ?? [], favoriteSet.has(Number(row.id))),
  );
}

async function logAlbumSearch(keyword: string, resultCount: number, userId?: number): Promise<void> {
  try {
    await dbClient.execute(
      `INSERT INTO search_log (scene, keyword, user_id, result_count, search_date)
       VALUES ('album', ?, ?, ?, CURDATE())`,
      [keyword, userId ?? null, resultCount],
    );
  } catch (error) {
    log.error('搜索日志写入失败', error);
  }
}

/** 图集列表：支持最新 / 热门 / 收藏排序、标签筛选、关键词检索与分页。 */
export async function listAlbums(
  query: {
    page?: number;
    pageSize?: number;
    sort?: SortType;
    tag?: string;
    keyword?: string;
    authorId?: number;
  },
  userId?: number,
): Promise<PageResult<AlbumCardDto>> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 24);
  const sort: SortType = query.sort === 'hot' || query.sort === 'fav' ? query.sort : 'new';
  const keyword = query.keyword?.trim().slice(0, 64) ?? '';
  const tagName = query.tag?.replace(/^#/, '').trim() ?? '';
  const conditions = [PUBLIC_WHERE];
  const params: unknown[] = [];

  if (query.authorId) {
    conditions.push('a.author_id = ?');
    params.push(query.authorId);
  }

  if (tagName) {
    conditions.push(
      `EXISTS (SELECT 1 FROM album_tag at JOIN tag t ON t.id = at.tag_id
                WHERE at.album_id = a.id AND t.name = ? AND t.status = 1 AND t.is_deleted = 0)`,
    );
    params.push(tagName);
  }

  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push(
      `(a.title LIKE ? OR au.name LIKE ? OR au.alias LIKE ?
        OR EXISTS (SELECT 1 FROM album_tag at2 JOIN tag t2 ON t2.id = at2.tag_id
                    WHERE at2.album_id = a.id AND t2.name LIKE ? AND t2.status = 1 AND t2.is_deleted = 0))`,
    );
    params.push(like, like, like, like);
  }

  const where = conditions.join(' AND ');
  const order =
    sort === 'hot'
      ? 'a.view_count DESC, a.published_at DESC, a.id DESC'
      : sort === 'fav'
        ? 'a.fav_count DESC, a.published_at DESC, a.id DESC'
        : 'a.published_at DESC, a.id DESC';

  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total ${ALBUM_FROM} WHERE ${where}`,
    params,
  );
  const total = Number(countRow?.total ?? 0);

  const rows = await dbClient.query<AlbumRow>(
    `SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  if (keyword) {
    await logAlbumSearch(keyword, total, userId);
  }

  return toPageResult(await buildAlbumCards(rows, userId), total, page, pageSize);
}

/** 瀑布流：推荐池优先，登录用户叠加最近浏览标签的偏好分。 */
export async function getFeed(
  page: number,
  pageSize: number,
  userId?: number,
): Promise<PageResult<AlbumCardDto>> {
  const normalized = normalizePage(page, pageSize, 24);
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

  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total ${ALBUM_FROM} WHERE ${PUBLIC_WHERE}`,
    [],
  );
  const total = Number(countRow?.total ?? 0);

  const rows = await dbClient.query<AlbumRow>(
    `SELECT ${ALBUM_SELECT}, ${prefScore} AS prefScore
       ${ALBUM_FROM}
      WHERE ${PUBLIC_WHERE}
      ORDER BY a.is_recommended DESC, prefScore DESC, a.view_count DESC, a.published_at DESC
      LIMIT ? OFFSET ?`,
    [...params, normalized.pageSize, normalized.offset],
  );

  return toPageResult(
    await buildAlbumCards(rows, userId),
    total,
    normalized.page,
    normalized.pageSize,
  );
}

function mapImage(row: ImageRow, useWatermark: boolean): AlbumImageDto {
  const url = useWatermark && row.watermarkUrl ? row.watermarkUrl : row.url;
  return {
    id: Number(row.id),
    mediaType: row.mediaType,
    url,
    thumbUrl: row.thumbUrl,
    watermarkUrl: row.watermarkUrl,
    width: row.width === null ? null : Number(row.width),
    height: row.height === null ? null : Number(row.height),
    duration: row.duration === null ? null : Number(row.duration),
    sortOrder: Number(row.sortOrder),
  };
}

function mapCommentUser(row: CommentRow): CommentUserDto {
  const role: EffectiveRole = effectiveRole(row.role, row.vipExpireAt);
  return {
    id: Number(row.userId),
    nickname: row.nickname,
    avatarType: Number(row.avatarType),
    avatarIndex: Number(row.avatarIndex),
    avatarUrl: row.avatarUrl,
    role,
  };
}

async function loadComments(
  albumId: number,
  userId: number | undefined,
): Promise<{ comments: CommentDto[]; total: number }> {
  const rows = await dbClient.query<CommentRow>(
    `SELECT c.id, c.parent_id AS parentId, c.reply_to_user_id AS replyToUserId,
            ru.nickname AS replyToName, c.content, c.status, c.created_at AS createdAt,
            u.id AS userId, u.nickname, u.avatar_type AS avatarType, u.avatar_index AS avatarIndex,
            u.avatar_url AS avatarUrl, u.role, u.vip_expire_at AS vipExpireAt
       FROM comment c
       JOIN \`user\` u ON u.id = c.user_id
       LEFT JOIN \`user\` ru ON ru.id = c.reply_to_user_id
      WHERE c.album_id = ? AND c.is_deleted = 0 AND (c.status = 'approved' OR c.user_id = ?)
      ORDER BY c.created_at ASC, c.id ASC`,
    [albumId, userId ?? 0],
  );

  const map = new Map<number, CommentDto>();
  for (const row of rows) {
    map.set(Number(row.id), {
      id: Number(row.id),
      parentId: row.parentId === null ? null : Number(row.parentId),
      replyToUserId: row.replyToUserId === null ? null : Number(row.replyToUserId),
      replyToName: row.replyToName,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt,
      isMine: userId === Number(row.userId),
      user: mapCommentUser(row),
      replies: [],
    });
  }

  const roots: CommentDto[] = [];
  for (const comment of map.values()) {
    if (comment.parentId && map.has(comment.parentId)) {
      map.get(comment.parentId)?.replies.push(comment);
    } else if (!comment.parentId) {
      roots.push(comment);
    }
  }

  const totalRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM comment WHERE album_id = ? AND status = 'approved' AND is_deleted = 0`,
    [albumId],
  );

  return { comments: roots, total: Number(totalRow?.total ?? 0) };
}

async function getWatermarkOn(): Promise<boolean> {
  const row = await dbClient.queryOne<{ value: string }>(
    `SELECT config_value AS value FROM sys_config WHERE config_key = 'image.watermark_on' LIMIT 1`,
  );
  return row?.value !== '0';
}

/** 图集详情：按角色与解锁状态返回前 3 张预览或全部媒体。 */
export async function getAlbumDetail(
  albumId: number,
  user: AuthUser | undefined,
  ip?: string,
): Promise<AlbumDetailDto> {
  const album = await dbClient.queryOne<AlbumRow>(
    `SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE a.id = ? AND ${PUBLIC_WHERE} LIMIT 1`,
    [albumId],
  );
  if (!album) {
    throw new HttpError(404, '图集不存在或已下架');
  }

  const userId = user?.id;
  const vip = isVipUser(user);

  const unlockedRow = userId
    ? await dbClient.queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total FROM album_unlock WHERE user_id = ? AND album_id = ?`,
        [userId, albumId],
      )
    : null;
  const unlocked = Number(unlockedRow?.total ?? 0) > 0;
  const canViewAll = vip || unlocked;

  const [watermarkOn, favoriteRow, subscriptionRow] = await Promise.all([
    getWatermarkOn(),
    userId
      ? dbClient.queryOne<{ total: number }>(
          `SELECT COUNT(*) AS total FROM favorite WHERE user_id = ? AND album_id = ?`,
          [userId, albumId],
        )
      : Promise.resolve(null),
    userId
      ? dbClient.queryOne<{ total: number }>(
          `SELECT COUNT(*) AS total FROM subscription WHERE user_id = ? AND author_id = ?`,
          [userId, album.authorId],
        )
      : Promise.resolve(null),
  ]);

  const images = canViewAll
    ? await dbClient.query<ImageRow>(
        `SELECT id, media_type AS mediaType, url, thumb_url AS thumbUrl, watermark_url AS watermarkUrl,
                width, height, duration, sort_order AS sortOrder
           FROM album_image
          WHERE album_id = ? AND is_deleted = 0
          ORDER BY (media_type = 'video') DESC, sort_order ASC, id ASC`,
        [albumId],
      )
    : await dbClient.query<ImageRow>(
        `SELECT id, media_type AS mediaType, url, thumb_url AS thumbUrl, watermark_url AS watermarkUrl,
                width, height, duration, sort_order AS sortOrder
           FROM album_image
          WHERE album_id = ? AND is_deleted = 0 AND media_type = 'image'
          ORDER BY sort_order ASC, id ASC
          LIMIT ?`,
        [albumId, FREE_PREVIEW_COUNT],
      );

  const useWatermark = !canViewAll && watermarkOn;

  const [tagMap, otherRows, commentData] = await Promise.all([
    loadTags([albumId]),
    dbClient.query<AlbumRow>(
      `SELECT ${ALBUM_SELECT} ${ALBUM_FROM}
        WHERE a.author_id = ? AND a.id <> ? AND ${PUBLIC_WHERE}
        ORDER BY a.published_at DESC, a.id DESC
        LIMIT 5`,
      [album.authorId, albumId],
    ),
    loadComments(albumId, userId),
  ]);

  const otherWorks = await buildAlbumCards(otherRows, userId);
  const imageCount = Number(album.imageCount);

  // 浏览量与明细；失败不阻断详情
  try {
    await dbClient.execute(`UPDATE album SET view_count = view_count + 1 WHERE id = ?`, [albumId]);
    await dbClient.execute(
      `INSERT INTO user_view_log (user_id, album_id, view_date, ip) VALUES (?, ?, CURDATE(), ?)`,
      [userId ?? null, albumId, ip ?? null],
    );
  } catch (error) {
    log.error('浏览记录写入失败', error);
  }

  const tags = (tagMap.get(albumId) ?? []).map((tag) => ({
    id: Number(tag.id),
    name: tag.name,
    useCount: Number(tag.useCount),
  }));

  return {
    ...mapAlbumCard(
      { ...album, viewCount: Number(album.viewCount) + 1 },
      tagMap.get(albumId) ?? [],
      Number(favoriteRow?.total ?? 0) > 0,
    ),
    description: album.description,
    status: album.status,
    author: {
      id: Number(album.authorId),
      name: album.authorName,
      initial: album.authorInitial,
      color: album.authorColor,
      avatarUrl: album.authorAvatarUrl,
      bio: album.authorBio,
      albumCount: Number(album.authorAlbumCount),
      subscribed: Number(subscriptionRow?.total ?? 0) > 0,
    },
    images: images.map((row) => mapImage(row, useWatermark)),
    totalImages: imageCount,
    locked: !canViewAll,
    unlocked,
    isVip: vip,
    canDownload: canViewAll,
    previewCount: canViewAll ? imageCount : Math.min(FREE_PREVIEW_COUNT, imageCount),
    lockedCount: canViewAll ? 0 : Math.max(0, imageCount - FREE_PREVIEW_COUNT),
    watermark: useWatermark,
    otherWorks,
    comments: commentData.comments,
    commentTotal: commentData.total,
    tags,
  };
}

/** 收藏 / 取消收藏，同时维护 album.fav_count。 */
export async function toggleFavorite(
  albumId: number,
  userId: number,
): Promise<{ favorited: boolean; favCount: number }> {
  const album = await dbClient.queryOne<{ id: number }>(
    `SELECT id FROM album WHERE id = ? AND status = 'published' AND is_deleted = 0 LIMIT 1`,
    [albumId],
  );
  if (!album) {
    throw new HttpError(404, '图集不存在或已下架');
  }

  return dbClient.transaction(async (conn) => {
    const existing = await queryOneOn<{ id: number }>(
      conn,
      `SELECT id FROM favorite WHERE user_id = ? AND album_id = ? FOR UPDATE`,
      [userId, albumId],
    );

    let favorited: boolean;
    if (existing) {
      await conn.query(`DELETE FROM favorite WHERE id = ?`, [existing.id]);
      await conn.query(
        `UPDATE album SET fav_count = GREATEST(CAST(fav_count AS SIGNED) - 1, 0) WHERE id = ?`,
        [albumId],
      );
      favorited = false;
    } else {
      await conn.query(`INSERT INTO favorite (user_id, album_id) VALUES (?, ?)`, [userId, albumId]);
      await conn.query(`UPDATE album SET fav_count = fav_count + 1 WHERE id = ?`, [albumId]);
      favorited = true;
    }

    const row = await queryOneOn<{ favCount: number }>(
      conn,
      `SELECT fav_count AS favCount FROM album WHERE id = ? LIMIT 1`,
      [albumId],
    );
    return { favorited, favCount: Number(row?.favCount ?? 0) };
  });
}

/** 发表评论：先审后发，返回待审核评论。 */
export async function createComment(
  albumId: number,
  userId: number,
  input: { content: string; parentId?: number | null; replyToUserId?: number | null },
): Promise<CommentDto> {
  const album = await dbClient.queryOne<{ id: number; title: string }>(
    `SELECT id, title FROM album WHERE id = ? AND status = 'published' AND is_deleted = 0 LIMIT 1`,
    [albumId],
  );
  if (!album) {
    throw new HttpError(404, '图集不存在或已下架');
  }

  if (input.parentId) {
    const parent = await dbClient.queryOne<{ id: number; albumId: number; userId: number }>(
      `SELECT id, album_id AS albumId, user_id AS userId
         FROM comment WHERE id = ? AND is_deleted = 0 LIMIT 1`,
      [input.parentId],
    );
    if (!parent || Number(parent.albumId) !== albumId) {
      throw new HttpError(400, '回复目标不存在');
    }
  }

  const [result] = await dbClient.pool.query(
    `INSERT INTO comment (album_id, user_id, parent_id, reply_to_user_id, content, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [albumId, userId, input.parentId ?? null, input.replyToUserId ?? null, input.content],
  );
  const commentId = (result as { insertId: number }).insertId;

  await dbClient.execute(
    `INSERT INTO user_notification (user_id, type, title, content, album_id)
     VALUES (?, 'review', '你的评论已提交审核', ?, ?)`,
    [userId, `在《${album.title}》下的评论等待管理员审核`, albumId],
  );

  const row = await dbClient.queryOne<CommentRow>(
    `SELECT c.id, c.parent_id AS parentId, c.reply_to_user_id AS replyToUserId,
            ru.nickname AS replyToName, c.content, c.status, c.created_at AS createdAt,
            u.id AS userId, u.nickname, u.avatar_type AS avatarType, u.avatar_index AS avatarIndex,
            u.avatar_url AS avatarUrl, u.role, u.vip_expire_at AS vipExpireAt
       FROM comment c
       JOIN \`user\` u ON u.id = c.user_id
       LEFT JOIN \`user\` ru ON ru.id = c.reply_to_user_id
      WHERE c.id = ? LIMIT 1`,
    [commentId],
  );

  if (!row) {
    throw new HttpError(500, '评论发表失败，请稍后重试');
  }

  return {
    id: Number(row.id),
    parentId: row.parentId === null ? null : Number(row.parentId),
    replyToUserId: row.replyToUserId === null ? null : Number(row.replyToUserId),
    replyToName: row.replyToName,
    content: row.content,
    status: row.status,
    createdAt: row.createdAt,
    isMine: true,
    user: mapCommentUser(row),
    replies: [],
  };
}

/** 删除本人评论（连同其下回复），同步 comment_count。 */
export async function deleteComment(commentId: number, userId: number): Promise<void> {
  await dbClient.transaction(async (conn) => {
    const comment = await queryOneOn<{
      id: number;
      userId: number;
      albumId: number;
      status: string;
      isDeleted: number;
    }>(
      conn,
      `SELECT id, user_id AS userId, album_id AS albumId, status, is_deleted AS isDeleted
         FROM comment WHERE id = ? FOR UPDATE`,
      [commentId],
    );
    if (!comment || comment.isDeleted === 1) {
      throw new HttpError(404, '评论不存在');
    }
    if (Number(comment.userId) !== userId) {
      throw new HttpError(403, '只能删除自己的评论');
    }

    const replies = await queryOnIds(conn, commentId);
    const ids = [commentId, ...replies];
    const placeholders = ids.map(() => '?').join(', ');
    const approvedRow = await queryOneOn<{ total: number }>(
      conn,
      `SELECT COUNT(*) AS total FROM comment WHERE id IN (${placeholders}) AND status = 'approved'`,
      ids,
    );
    await conn.query(
      `UPDATE comment SET status = 'deleted', is_deleted = 1 WHERE id IN (${placeholders})`,
      ids,
    );
    const approved = Number(approvedRow?.total ?? 0);
    if (approved > 0) {
      await conn.query(
        `UPDATE album SET comment_count = GREATEST(CAST(comment_count AS SIGNED) - ?, 0) WHERE id = ?`,
        [approved, comment.albumId],
      );
    }
  });
}

async function queryOnIds(conn: TransactionConnection, parentId: number): Promise<number[]> {
  const rows = await queryOn<{ id: number }>(
    conn,
    `SELECT id FROM comment WHERE parent_id = ? AND is_deleted = 0`,
    [parentId],
  );
  return rows.map((row) => Number(row.id));
}

/** 按 ID 批量取图集卡片（用于收藏 / 解锁 / 购买列表）。 */
export async function getAlbumCardsByIds(
  albumIds: number[],
  userId?: number,
): Promise<Map<number, AlbumCardDto>> {
  const unique = [...new Set(albumIds)];
  const result = new Map<number, AlbumCardDto>();
  if (unique.length === 0) {
    return result;
  }
  const placeholders = unique.map(() => '?').join(', ');
  const rows = await dbClient.query<AlbumRow>(
    `SELECT ${ALBUM_SELECT} ${ALBUM_FROM} WHERE a.id IN (${placeholders}) AND ${PUBLIC_WHERE}`,
    unique,
  );
  const cards = await buildAlbumCards(rows, userId);
  for (const card of cards) {
    result.set(card.id, card);
  }
  return result;
}

export async function getAlbumCardById(
  albumId: number,
  userId?: number,
): Promise<AlbumCardDto | null> {
  const map = await getAlbumCardsByIds([albumId], userId);
  return map.get(albumId) ?? null;
}

/** 我的收藏：按收藏时间倒序，每页 12 套。 */
export async function listFavoriteAlbums(
  userId: number,
  page = 1,
  pageSize = 12,
): Promise<PageResult<AlbumCardDto>> {
  const normalized = normalizePage(page, pageSize, 12);
  const where = `f.user_id = ? AND ${PUBLIC_WHERE}`;
  const countRow = await dbClient.queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM favorite f
       JOIN album a ON a.id = f.album_id
       JOIN author au ON au.id = a.author_id
      WHERE ${where}`,
    [userId],
  );
  const total = Number(countRow?.total ?? 0);

  const rows = await dbClient.query<{ albumId: number }>(
    `SELECT f.album_id AS albumId
       FROM favorite f
       JOIN album a ON a.id = f.album_id
       JOIN author au ON au.id = a.author_id
      WHERE ${where}
      ORDER BY f.created_at DESC, f.id DESC
      LIMIT ? OFFSET ?`,
    [userId, normalized.pageSize, normalized.offset],
  );

  const cards = await getAlbumCardsByIds(
    rows.map((row) => Number(row.albumId)),
    userId,
  );
  const list = rows
    .map((row) => cards.get(Number(row.albumId)))
    .filter((card): card is AlbumCardDto => card !== undefined);

  return toPageResult(list, total, normalized.page, normalized.pageSize);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 80) || 'sylvie-album';
}

/** 已解锁 / 付费会员下载整包原图；返回 ZIP 流。 */
export async function createAlbumZip(
  albumId: number,
  user: AuthUser,
): Promise<{ stream: Readable; filename: string }> {
  const album = await dbClient.queryOne<{
    id: number;
    title: string;
    authorName: string;
  }>(
    `SELECT a.id, a.title, au.name AS authorName
       FROM album a JOIN author au ON au.id = a.author_id
      WHERE a.id = ? AND ${PUBLIC_WHERE} LIMIT 1`,
    [albumId],
  );
  if (!album) {
    throw new HttpError(404, '图集不存在或已下架');
  }

  if (!isVipUser(user)) {
    const unlocked = await dbClient.queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM album_unlock WHERE user_id = ? AND album_id = ?`,
      [user.id, albumId],
    );
    if (Number(unlocked?.total ?? 0) === 0) {
      throw new HttpError(403, '请先使用积分解锁或开通付费会员后下载');
    }
  }

  const images = await dbClient.query<{ url: string }>(
    `SELECT url FROM album_image
      WHERE album_id = ? AND media_type = 'image' AND is_deleted = 0
      ORDER BY sort_order ASC, id ASC`,
    [albumId],
  );
  if (images.length === 0) {
    throw new HttpError(404, '该图集暂无可下载的图片');
  }

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('warning', (error) => {
    log.warn('压缩告警', error);
  });
  archive.on('error', (error) => {
    log.error('压缩失败', error);
  });

  void (async () => {
    for (const [index, image] of images.entries()) {
      try {
        const response = await fetch(image.url);
        if (!response.ok || !response.body) {
          continue;
        }
        const extension = /\.(png|jpe?g|webp)$/i.exec(image.url)?.[1]?.toLowerCase() ?? 'jpg';
        const name = `${String(index + 1).padStart(3, '0')}.${extension}`;
        archive.append(Readable.fromWeb(response.body as never), { name });
      } catch (error) {
        log.warn('图片下载失败', error, { index: index + 1 });
      }
    }
    await archive.finalize();
  })();

  try {
    await dbClient.execute(`UPDATE album SET download_count = download_count + 1 WHERE id = ?`, [
      albumId,
    ]);
    await dbClient.execute(
      `INSERT INTO download_log (user_id, album_id, download_date) VALUES (?, ?, CURDATE())`,
      [user.id, albumId],
    );
  } catch (error) {
    log.error('下载记录写入失败', error);
  }

  return {
    stream: archive,
    filename: `${sanitizeFilename(`${album.title} - ${album.authorName}`)}.zip`,
  };
}
