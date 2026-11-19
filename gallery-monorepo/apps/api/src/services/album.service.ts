/**
 * 前台图集业务：列表 / 瀑布流、详情与权限判定、收藏、评论与整包下载。
 * 访问规则：游客与注册会员未解锁时只能看前 3 张预览（可加水印），
 * 注册会员用积分解锁后、付费会员与管理员可查看全部并下载原图。
 */
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
import {
  albumListFilter,
  albumListOrder,
  countAlbumUnlock,
  countAlbums,
  countApprovedAlbumComments,
  countApprovedCommentsByIds,
  countFavorite,
  countFavoriteAlbums,
  countFeedAlbums,
  countSubscription,
  decrementAlbumCommentCount,
  decrementAlbumFavCount,
  deleteFavorite,
  incrementAlbumDownloadCount,
  incrementAlbumFavCount,
  incrementAlbumView,
  insertAlbumSearchLog,
  insertComment,
  insertDownloadLog,
  insertFavorite,
  insertReviewNotification,
  insertUserViewLog,
  selectAlbumComments,
  selectAlbumFavCount,
  selectAlbumForDownload,
  selectAlbumImages,
  selectAlbumsByIds,
  selectAlbumsPage,
  selectAlbumTags,
  selectCommentById,
  selectCommentForUpdate,
  selectCommentParent,
  selectDownloadImageUrls,
  selectFavoriteAlbumIds,
  selectFavoriteForUpdate,
  selectFavoritesForAlbums,
  selectFeedAlbums,
  selectOtherWorks,
  selectPreviewAlbumImages,
  selectPublishedAlbum,
  selectPublishedAlbumId,
  selectPublishedAlbumTitle,
  selectReplyCommentIds,
  selectWatermarkConfig,
  softDeleteCommentsByIds,
  type AlbumCommentRow,
  type AlbumImageRow,
  type AlbumRow,
  type AlbumTagRow,
} from '../sql/album.sql.js';
import type { AuthUser } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { effectiveRole, normalizePage, toBool, toNumber, toPageResult } from '../utils/format.js';
import { moduleLogger } from '../utils/logger.js';
import { isVipUser } from './user.service.js';

const log = moduleLogger('album');

/** 图集行映射为卡片 DTO：附加标签、作者摘要与当前用户收藏状态。 */
function mapAlbumCard(row: AlbumRow, tags: AlbumTagRow[], favorited: boolean): AlbumCardDto {
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

/** 批量加载图集标签并按图集 id 分组，避免逐条查询。 */
async function loadTags(albumIds: number[]): Promise<Map<number, AlbumTagRow[]>> {
  const map = new Map<number, AlbumTagRow[]>();
  if (albumIds.length === 0) {
    return map;
  }
  const statement = selectAlbumTags(albumIds);
  const rows = await dbClient.query<AlbumTagRow>(statement.sql, statement.params);
  for (const row of rows) {
    const list = map.get(Number(row.albumId)) ?? [];
    list.push(row);
    map.set(Number(row.albumId), list);
  }
  return map;
}

/** 批量加载当前用户已收藏的图集 id；游客返回空集合。 */
async function loadFavorites(userId: number | undefined, albumIds: number[]): Promise<Set<number>> {
  if (!userId || albumIds.length === 0) {
    return new Set();
  }
  const statement = selectFavoritesForAlbums(userId, albumIds);
  const rows = await dbClient.query<{ albumId: number }>(statement.sql, statement.params);
  return new Set(rows.map((row) => Number(row.albumId)));
}

/** 批量组装图集卡片（标签与收藏状态并发加载）。 */
async function buildAlbumCards(rows: AlbumRow[], userId?: number): Promise<AlbumCardDto[]> {
  const ids = rows.map((row) => Number(row.id));
  const [tagMap, favoriteSet] = await Promise.all([loadTags(ids), loadFavorites(userId, ids)]);
  return rows.map((row) =>
    mapAlbumCard(row, tagMap.get(Number(row.id)) ?? [], favoriteSet.has(Number(row.id))),
  );
}

async function logAlbumSearch(keyword: string, resultCount: number, userId?: number): Promise<void> {
  try {
    const statement = insertAlbumSearchLog(keyword, userId, resultCount);
    await dbClient.execute(statement.sql, statement.params);
  } catch (error) {
    log.error('搜索日志写入失败', error);
  }
}

/**
 * 图集列表：支持最新 / 热门 / 收藏排序、标签筛选、关键词检索与分页。
 * 默认每页 24 套；关键词截断 64 字符、标签去掉前缀 `#`；
 * 关键词非空时异步写搜索日志（失败不影响返回）。`userId` 用于叠加收藏状态。
 */
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
  const where = albumListFilter({ authorId: query.authorId, tagName, keyword });
  const order = albumListOrder(sort);

  const countStatement = countAlbums(where);
  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const total = Number(countRow?.total ?? 0);

  const pageStatement = selectAlbumsPage(where, order, pageSize, offset);
  const rows = await dbClient.query<AlbumRow>(pageStatement.sql, pageStatement.params);

  if (keyword) {
    await logAlbumSearch(keyword, total, userId);
  }

  return toPageResult(await buildAlbumCards(rows, userId), total, page, pageSize);
}

/**
 * 瀑布流：推荐池优先，登录用户叠加最近浏览标签的偏好分。
 * 默认每页 24 套；`userId` 为空时按推荐位 + 浏览量排序。
 */
export async function getFeed(
  page: number,
  pageSize: number,
  userId?: number,
): Promise<PageResult<AlbumCardDto>> {
  const normalized = normalizePage(page, pageSize, 24);

  const countStatement = countFeedAlbums();
  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const total = Number(countRow?.total ?? 0);

  const pageStatement = selectFeedAlbums(userId, normalized.pageSize, normalized.offset);
  const rows = await dbClient.query<AlbumRow>(pageStatement.sql, pageStatement.params);

  return toPageResult(
    await buildAlbumCards(rows, userId),
    total,
    normalized.page,
    normalized.pageSize,
  );
}

/**
 * 媒体行映射：未解锁且全局水印开启时优先返回水印图，
 * 否则返回原图；`watermarkUrl` 始终保留在 DTO 中供前端展示。
 */
function mapImage(row: AlbumImageRow, useWatermark: boolean): AlbumImageDto {
  // 只有水印图存在时才替换，避免水印缺失导致预览无图。
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

/** 评论用户映射：按会员到期时间计算有效角色（过期 VIP 显示为 member）。 */
function mapCommentUser(row: AlbumCommentRow): CommentUserDto {
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

/**
 * 加载并组装评论树：顶层评论 + 一层回复。
 * 只返回已审核评论（或当前用户自己的待审核 / 被拒评论），
 * `total` 与展示口径一致，仅统计已审核数量。
 */
async function loadComments(
  albumId: number,
  userId: number | undefined,
): Promise<{ comments: CommentDto[]; total: number }> {
  const statement = selectAlbumComments(albumId, userId);
  const rows = await dbClient.query<AlbumCommentRow>(statement.sql, statement.params);

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

  const countStatement = countApprovedAlbumComments(albumId);
  const totalRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );

  return { comments: roots, total: Number(totalRow?.total ?? 0) };
}

/** 全局水印开关：缺省视为开启，仅显式配置为 `0` 时关闭。 */
async function getWatermarkOn(): Promise<boolean> {
  const statement = selectWatermarkConfig();
  const row = await dbClient.queryOne<{ value: string }>(statement.sql, statement.params);
  return row?.value !== '0';
}

/**
 * 图集详情：按角色与解锁状态返回前 3 张预览或全部媒体。
 * 权限判定：有效付费会员 / 管理员或已积分解锁 → 全部媒体、无水印、可下载；
 * 否则只返回前 `FREE_PREVIEW_COUNT`（3）张预览，且全局水印开启时使用水印图。
 * 浏览量与浏览日志异步维护，失败只记日志，不影响详情返回。
 */
export async function getAlbumDetail(
  albumId: number,
  user: AuthUser | undefined,
  ip?: string,
): Promise<AlbumDetailDto> {
  const albumStatement = selectPublishedAlbum(albumId);
  const album = await dbClient.queryOne<AlbumRow>(albumStatement.sql, albumStatement.params);
  if (!album) {
    throw new HttpError(404, '图集不存在或已下架');
  }

  const userId = user?.id;
  const vip = isVipUser(user);

  const unlockedStatement = userId ? countAlbumUnlock(userId, albumId) : null;
  const unlockedRow = unlockedStatement
    ? await dbClient.queryOne<{ total: number }>(
        unlockedStatement.sql,
        unlockedStatement.params,
      )
    : null;
  const unlocked = Number(unlockedRow?.total ?? 0) > 0;
  const canViewAll = vip || unlocked;

  const [watermarkOn, favoriteRow, subscriptionRow] = await Promise.all([
    getWatermarkOn(),
    userId
      ? (() => {
          const statement = countFavorite(userId, albumId);
          return dbClient.queryOne<{ total: number }>(statement.sql, statement.params);
        })()
      : Promise.resolve(null),
    userId
      ? (() => {
          const statement = countSubscription(userId, Number(album.authorId));
          return dbClient.queryOne<{ total: number }>(statement.sql, statement.params);
        })()
      : Promise.resolve(null),
  ]);

  const images = canViewAll
    ? await (() => {
        const statement = selectAlbumImages(albumId);
        return dbClient.query<AlbumImageRow>(statement.sql, statement.params);
      })()
    : await (() => {
        const statement = selectPreviewAlbumImages(albumId, FREE_PREVIEW_COUNT);
        return dbClient.query<AlbumImageRow>(statement.sql, statement.params);
      })();

  const useWatermark = !canViewAll && watermarkOn;

  const [tagMap, otherRows, commentData] = await Promise.all([
    loadTags([albumId]),
    (() => {
      const statement = selectOtherWorks(Number(album.authorId), albumId);
      return dbClient.query<AlbumRow>(statement.sql, statement.params);
    })(),
    loadComments(albumId, userId),
  ]);

  const otherWorks = await buildAlbumCards(otherRows, userId);
  const imageCount = Number(album.imageCount);

  // 浏览量与明细；失败不阻断详情
  try {
    const viewStatement = incrementAlbumView(albumId);
    await dbClient.execute(viewStatement.sql, viewStatement.params);
    const viewLogStatement = insertUserViewLog(userId, albumId, ip);
    await dbClient.execute(viewLogStatement.sql, viewLogStatement.params);
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

/**
 * 收藏 / 取消收藏，同时维护 `album.fav_count`。
 * 事务内 `FOR UPDATE` 读取收藏记录：存在则删除并 -1、否则插入并 +1，
 * 计数增减与收藏关系变更同事务提交，避免冗余计数漂移。
 */
export async function toggleFavorite(
  albumId: number,
  userId: number,
): Promise<{ favorited: boolean; favCount: number }> {
  const albumStatement = selectPublishedAlbumId(albumId);
  const album = await dbClient.queryOne<{ id: number }>(
    albumStatement.sql,
    albumStatement.params,
  );
  if (!album) {
    throw new HttpError(404, '图集不存在或已下架');
  }

  return dbClient.transaction(async (conn) => {
    const existingStatement = selectFavoriteForUpdate(userId, albumId);
    const existing = await queryOneOn<{ id: number }>(
      conn,
      existingStatement.sql,
      existingStatement.params,
    );

    let favorited: boolean;
    if (existing) {
      const deleteStatement = deleteFavorite(Number(existing.id));
      await conn.query(deleteStatement.sql, deleteStatement.params);
      const decrementStatement = decrementAlbumFavCount(albumId);
      await conn.query(decrementStatement.sql, decrementStatement.params);
      favorited = false;
    } else {
      const insertStatement = insertFavorite(userId, albumId);
      await conn.query(insertStatement.sql, insertStatement.params);
      const incrementStatement = incrementAlbumFavCount(albumId);
      await conn.query(incrementStatement.sql, incrementStatement.params);
      favorited = true;
    }

    const countStatement = selectAlbumFavCount(albumId);
    const row = await queryOneOn<{ favCount: number }>(
      conn,
      countStatement.sql,
      countStatement.params,
    );
    return { favorited, favCount: Number(row?.favCount ?? 0) };
  });
}

/**
 * 发表评论：先审后发，返回待审核评论。
 * 校验图集已发布、回复目标属于同一图集；新评论 `status='pending'`，
 * 因此发表时不增加 `album.comment_count`，并写入待审核通知。
 */
export async function createComment(
  albumId: number,
  userId: number,
  input: { content: string; parentId?: number | null; replyToUserId?: number | null },
): Promise<CommentDto> {
  const albumStatement = selectPublishedAlbumTitle(albumId);
  const album = await dbClient.queryOne<{ id: number; title: string }>(
    albumStatement.sql,
    albumStatement.params,
  );
  if (!album) {
    throw new HttpError(404, '图集不存在或已下架');
  }

  if (input.parentId) {
    const parentStatement = selectCommentParent(input.parentId);
    const parent = await dbClient.queryOne<{ id: number; albumId: number; userId: number }>(
      parentStatement.sql,
      parentStatement.params,
    );
    if (!parent || Number(parent.albumId) !== albumId) {
      throw new HttpError(400, '回复目标不存在');
    }
  }

  const insertStatement = insertComment({
    albumId,
    userId,
    parentId: input.parentId ?? null,
    replyToUserId: input.replyToUserId ?? null,
    content: input.content,
  });
  const [result] = await dbClient.pool.query(insertStatement.sql, insertStatement.params);
  const commentId = (result as { insertId: number }).insertId;

  const notificationStatement = insertReviewNotification(
    userId,
    `在《${album.title}》下的评论等待管理员审核`,
    albumId,
  );
  await dbClient.execute(notificationStatement.sql, notificationStatement.params);

  const rowStatement = selectCommentById(commentId);
  const row = await dbClient.queryOne<AlbumCommentRow>(
    rowStatement.sql,
    rowStatement.params,
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

/**
 * 删除本人评论（连同其下回复），同步 comment_count。
 * 事务内 `FOR UPDATE` 锁定评论，校验归属后软删除父评论与回复；
 * 仅将其中「已审核」的评论数从 `album.comment_count` 扣减，且不会被扣成负数。
 */
export async function deleteComment(commentId: number, userId: number): Promise<void> {
  await dbClient.transaction(async (conn) => {
    const commentStatement = selectCommentForUpdate(commentId);
    const comment = await queryOneOn<{
      id: number;
      userId: number;
      albumId: number;
      status: string;
      isDeleted: number;
    }>(conn, commentStatement.sql, commentStatement.params);
    if (!comment || comment.isDeleted === 1) {
      throw new HttpError(404, '评论不存在');
    }
    if (Number(comment.userId) !== userId) {
      throw new HttpError(403, '只能删除自己的评论');
    }

    const replies = await queryOnIds(conn, commentId);
    const ids = [commentId, ...replies];
    const approvedStatement = countApprovedCommentsByIds(ids);
    const approvedRow = await queryOneOn<{ total: number }>(
      conn,
      approvedStatement.sql,
      approvedStatement.params,
    );
    const deleteStatement = softDeleteCommentsByIds(ids);
    await conn.query(deleteStatement.sql, deleteStatement.params);
    const approved = Number(approvedRow?.total ?? 0);
    if (approved > 0) {
      const decrementStatement = decrementAlbumCommentCount(Number(comment.albumId), approved);
      await conn.query(decrementStatement.sql, decrementStatement.params);
    }
  });
}

/** 在同一事务连接上查询某评论的回复 id 列表。 */
async function queryOnIds(conn: TransactionConnection, parentId: number): Promise<number[]> {
  const statement = selectReplyCommentIds(parentId);
  const rows = await queryOn<{ id: number }>(conn, statement.sql, statement.params);
  return rows.map((row) => Number(row.id));
}

/**
 * 按 ID 批量取图集卡片（用于收藏 / 解锁 / 购买列表）。
 * 先去重，再一次性查询并组装；返回以图集 id 为键的 Map，
 * 已下架 / 软删除的图集不会出现在结果中。
 */
export async function getAlbumCardsByIds(
  albumIds: number[],
  userId?: number,
): Promise<Map<number, AlbumCardDto>> {
  const unique = [...new Set(albumIds)];
  const result = new Map<number, AlbumCardDto>();
  if (unique.length === 0) {
    return result;
  }
  const statement = selectAlbumsByIds(unique);
  const rows = await dbClient.query<AlbumRow>(statement.sql, statement.params);
  const cards = await buildAlbumCards(rows, userId);
  for (const card of cards) {
    result.set(card.id, card);
  }
  return result;
}

/** 按 id 取单个图集卡片；不可见或不存在时返回 null。 */
export async function getAlbumCardById(
  albumId: number,
  userId?: number,
): Promise<AlbumCardDto | null> {
  const map = await getAlbumCardsByIds([albumId], userId);
  return map.get(albumId) ?? null;
}

/**
 * 我的收藏：按收藏时间倒序，每页 12 套。
 * 只返回仍公开可见的图集；total 与列表口径一致。
 */
export async function listFavoriteAlbums(
  userId: number,
  page = 1,
  pageSize = 12,
): Promise<PageResult<AlbumCardDto>> {
  const normalized = normalizePage(page, pageSize, 12);
  const countStatement = countFavoriteAlbums(userId);
  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const total = Number(countRow?.total ?? 0);

  const pageStatement = selectFavoriteAlbumIds(
    userId,
    normalized.pageSize,
    normalized.offset,
  );
  const rows = await dbClient.query<{ albumId: number }>(
    pageStatement.sql,
    pageStatement.params,
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

/** 清理 ZIP 文件名中的非法字符并截断，空结果回退为默认名。 */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 80) || 'sylvie-album';
}

/**
 * 已解锁 / 付费会员下载整包原图；返回 ZIP 流。
 * 权限：管理员 / 有效付费会员直接通过，其余用户必须已有 `album_unlock` 记录，
 * 否则 403。图片逐张拉取并流式写入 ZIP（单张失败跳过），
 * 下载次数与下载日志在开始下载后维护，写入失败不阻断下载。
 */
export async function createAlbumZip(
  albumId: number,
  user: AuthUser,
): Promise<{ stream: Readable; filename: string }> {
  const albumStatement = selectAlbumForDownload(albumId);
  const album = await dbClient.queryOne<{
    id: number;
    title: string;
    authorName: string;
  }>(albumStatement.sql, albumStatement.params);
  if (!album) {
    throw new HttpError(404, '图集不存在或已下架');
  }

  if (!isVipUser(user)) {
    const unlockedStatement = countAlbumUnlock(user.id, albumId);
    const unlocked = await dbClient.queryOne<{ total: number }>(
      unlockedStatement.sql,
      unlockedStatement.params,
    );
    if (Number(unlocked?.total ?? 0) === 0) {
      throw new HttpError(403, '请先使用积分解锁或开通付费会员后下载');
    }
  }

  const imagesStatement = selectDownloadImageUrls(albumId);
  const images = await dbClient.query<{ url: string }>(
    imagesStatement.sql,
    imagesStatement.params,
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
    const downloadStatement = incrementAlbumDownloadCount(albumId);
    await dbClient.execute(downloadStatement.sql, downloadStatement.params);
    const downloadLogStatement = insertDownloadLog(user.id, albumId);
    await dbClient.execute(downloadLogStatement.sql, downloadLogStatement.params);
  } catch (error) {
    log.error('下载记录写入失败', error);
  }

  return {
    stream: archive,
    filename: `${sanitizeFilename(`${album.title} - ${album.authorName}`)}.zip`,
  };
}
