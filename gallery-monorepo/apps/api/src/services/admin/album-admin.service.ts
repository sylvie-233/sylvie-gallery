/**
 * 后台图集管理：列表 / 详情、保存（新建或编辑）、上下架、推荐池开关与软删除。
 *
 * 写操作遵循「校验 → 事务内写主表与关联（标签、媒体、冗余计数）→ 事务提交后写操作日志」的顺序，
 * 事务失败时主表、关联与冗余计数一并回滚。
 */
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
import {
  buildAdminAlbumWhere,
  countAdminAlbums,
  deleteAlbumTags,
  insertAdminAlbum,
  insertAlbumImage,
  insertAlbumPublishNotifications,
  insertAlbumTag,
  offlineAdminAlbum,
  publishAdminAlbum,
  recalcAuthorStats,
  recalcTagUseCount,
  selectAdminAlbumDetail,
  selectAdminAlbumMedia,
  selectAdminAlbumMediaForSync,
  selectAdminAlbumRecommend,
  selectAdminAlbumTags,
  selectAdminAlbums,
  selectAlbumTagIds,
  selectAuthorForAlbum,
  selectValidTagIds,
  softDeleteAdminAlbum,
  softDeleteAlbumImages,
  softDeleteStaleAlbumImages,
  updateAdminAlbum,
  updateAdminAlbumRecommend,
  updateAlbumImage,
  type AdminAlbumDbRow,
  type AlbumTagIdRow,
  type AlbumTagRow,
  type MediaDbRow,
} from '../../sql/admin/album-admin.sql.js';
import { HttpError } from '../../utils/http.js';
import { normalizePage, toBool, toPageResult, toSqlDateTime } from '../../utils/format.js';
import { moduleLogger } from '../../utils/logger.js';
import { getObjectSize } from '../storage.service.js';
import { logAdminOp } from './log.service.js';

const log = moduleLogger('album-admin');

/**
 * 图集首次发布后，向订阅该作者的用户批量写入「更新」通知。
 *
 * 通知属于非关键路径：失败只记录日志，不影响发布结果。这里直接写库
 * （一条 `INSERT ... SELECT`），不经过消息队列；订阅规模或分发渠道扩展后，
 * 可将本函数替换为 `@sylvie/job` 任务，调用方无需改动。
 */
async function notifyAlbumPublished(detail: AdminAlbumDetail): Promise<void> {
  try {
    const statement = insertAlbumPublishNotifications({
      albumId: detail.id,
      authorId: detail.authorId,
      title: detail.title,
      imageCount: detail.imageCount,
      videoCount: detail.videoCount,
    });
    const result = await dbClient.execute(statement.sql, statement.params);
    if (result.affectedRows > 0) {
      log.info('已通知图集订阅者', {
        albumId: detail.id,
        count: result.affectedRows,
      });
    }
  } catch (error) {
    log.error('发布通知写入失败（不影响发布）', error, { albumId: detail.id });
  }
}

/** 将数据库行转换为后台图集列表行，统一把 BIGINT / 0-1 值转成前端可用的数字与布尔值。 */
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

/** 将媒体行映射为编辑表单使用的媒体输入；空尺寸 / 时长保持 null，避免前端误判为 0。 */
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

/**
 * 分页查询后台图集列表。
 *
 * @param query.status 仅接受 published / draft / offline，其他值视为不筛选
 * @param query.keyword 在标题与作者名中模糊匹配
 * @param query.page / query.pageSize 未传时默认每页 6 条
 * 只返回 is_deleted = 0 的图集，按发布时间（缺失时回退创建时间）倒序。
 */
export async function getAdminAlbums(query: {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageResult<AdminAlbumRow>> {
  const { page, pageSize, offset } = normalizePage(query.page, query.pageSize, 6);
  const where = buildAdminAlbumWhere({ status: query.status, keyword: query.keyword });

  const countStatement = countAdminAlbums(where);
  const countRow = await dbClient.queryOne<{ total: number }>(
    countStatement.sql,
    countStatement.params,
  );
  const listStatement = selectAdminAlbums(where, pageSize, offset);
  const rows = await dbClient.query<AdminAlbumDbRow>(listStatement.sql, listStatement.params);

  return toPageResult(rows.map(mapAlbumRow), Number(countRow?.total ?? 0), page, pageSize);
}

/**
 * 读取图集详情，包含作者、标签、图片与视频。
 *
 * 详情、标签、媒体三次查询并发执行；图集不存在或已软删除时抛 404。
 * 标签按收录数倒序，媒体按 sort_order 升序，并按 mediaType 拆分为 images / videos。
 */
export async function getAdminAlbumDetail(albumId: number): Promise<AdminAlbumDetail> {
  const detailStatement = selectAdminAlbumDetail(albumId);
  const row = await dbClient.queryOne<AdminAlbumDbRow>(
    detailStatement.sql,
    detailStatement.params,
  );
  if (!row) {
    throw new HttpError(404, '图集不存在');
  }

  const tagsStatement = selectAdminAlbumTags(albumId);
  const mediaStatement = selectAdminAlbumMedia(albumId);
  const [tagRows, mediaRows] = await Promise.all([
    dbClient.query<AlbumTagRow>(tagsStatement.sql, tagsStatement.params),
    dbClient.query<MediaDbRow>(mediaStatement.sql, mediaStatement.params),
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

/**
 * 估算图集压缩包大小（MB，保留两位小数），写入 album.package_size 供前台展示。
 *
 * 优先使用前端传入的 size；缺失时依次尝试：对象存储按 key 探测 → 对 http(s) 地址发 HEAD。
 * 每批 8 个并发，失败或超时（2.5s）的单个媒体按 0 计，保证保存流程不被外部探测阻塞。
 */
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

/** 在事务连接上重算标签收录数；去重后批量更新，空列表直接跳过。 */
async function recalcTags(conn: TransactionConnection, tagIds: number[]): Promise<void> {
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) {
    return;
  }
  const statement = recalcTagUseCount(unique);
  await conn.query(statement.sql, statement.params);
}

/** 在事务连接上逐个重算作者图集数与最近更新时间；传入新旧作者以覆盖归属变更场景。 */
async function recalcAuthors(conn: TransactionConnection, authorIds: number[]): Promise<void> {
  const unique = [...new Set(authorIds)];
  for (const authorId of unique) {
    const statement = recalcAuthorStats(authorId);
    await conn.query(statement.sql, statement.params);
  }
}

/**
 * 同步图集媒体：保留的既有媒体执行更新（并把 is_deleted 复位为 0），新增的插入，
 * 表单中已移除的既有媒体按 ID 软删除。sortOrder 取表单内下标 + 1，图片与视频分别计数。
 *
 * 必须与保存图集的主表更新在同一事务中执行。
 */
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
        const statement = updateAlbumImage({
          mediaType,
          url: media.url,
          thumbUrl: media.thumbUrl ?? null,
          watermarkUrl: media.watermarkUrl ?? null,
          width: media.width ?? null,
          height: media.height ?? null,
          duration: media.duration ?? null,
          sortOrder,
          id: media.id,
          albumId,
        });
        await conn.query(statement.sql, statement.params);
      } else {
        const statement = insertAlbumImage({
          mediaType,
          url: media.url,
          thumbUrl: media.thumbUrl ?? null,
          watermarkUrl: media.watermarkUrl ?? null,
          width: media.width ?? null,
          height: media.height ?? null,
          duration: media.duration ?? null,
          sortOrder,
          albumId,
        });
        await conn.query(statement.sql, statement.params);
      }
    }
  };

  await writeList('image', images);
  await writeList('video', videos);

  const staleIds = [...existingIds].filter((id) => !usedIds.has(id));
  if (staleIds.length > 0) {
    const statement = softDeleteStaleAlbumImages(albumId, staleIds);
    await conn.query(statement.sql, statement.params);
  }
}

/**
 * 新建或编辑图集（albumId 为 null 时新建）。
 *
 * 流程与事务边界：
 * 1. 事务外校验标题长度、媒体数量、归属作者、标签有效性，并估算压缩包大小；
 * 2. 事务内写 album 主表（新建时生成 ID），全量重建 album_tag，按表单同步媒体，
 *    最后重算新旧标签的收录数与新旧作者的图集数——这些写入必须同事务，避免计数与关联不一致；
 * 3. 事务提交后再写 admin_op_log（分别记为 album.create / album.draft / album.edit），
 *    日志不参与回滚，也不阻塞主流程。
 *
 * 副作用：首次发布会写入 published_at；编辑时保留原发布时间。返回最新详情。
 */
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

  const existingStatement = albumId ? selectAdminAlbumDetail(albumId) : null;
  const existing = existingStatement
    ? await dbClient.queryOne<AdminAlbumDbRow>(existingStatement.sql, existingStatement.params)
    : null;
  if (albumId && !existing) {
    throw new HttpError(404, '图集不存在');
  }

  const authorStatement = selectAuthorForAlbum(input.authorId);
  const author = await dbClient.queryOne<{ id: number; status: number }>(
    authorStatement.sql,
    authorStatement.params,
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
    const validStatement = selectValidTagIds(tagIds);
    const validRows = await dbClient.query<{ id: number }>(
      validStatement.sql,
      validStatement.params,
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
  let oldTagIds: number[] = [];
  if (existing && albumId) {
    const oldTagsStatement = selectAlbumTagIds(albumId);
    const oldTagRows = await dbClient.query<AlbumTagIdRow>(
      oldTagsStatement.sql,
      oldTagsStatement.params,
    );
    oldTagIds = oldTagRows.map((row) => Number(row.tagId));
  }

  const targetId = await dbClient.transaction(async (conn) => {
    let currentId = albumId;
    let publishedAt = existing?.publishedAt ?? null;
    // 首次进入 published 时记录发布时间；重复发布保留原值。
    if (status === 'published' && existing?.status !== 'published') {
      publishedAt = toSqlDateTime();
    }
    // 新建且非发布状态不写发布时间。
    if (status !== 'published' && !existing) {
      publishedAt = null;
    }

    if (!currentId) {
      const statement = insertAdminAlbum({
        authorId: input.authorId,
        title,
        description: input.description?.trim() || null,
        coverUrl,
        imageCount,
        videoCount,
        packageSize,
        points,
        status,
        publishedAt,
        adminId,
      });
      const [result] = await conn.query(statement.sql, statement.params);
      currentId = (result as { insertId: number }).insertId;
    } else {
      const statement = updateAdminAlbum({
        authorId: input.authorId,
        title,
        description: input.description?.trim() || null,
        coverUrl,
        imageCount,
        videoCount,
        packageSize,
        points,
        status,
        publishedAt,
        albumId: currentId,
      });
      await conn.query(statement.sql, statement.params);
    }

    // 标签关联采用全量重建：先清空再按表单插入。
    const deleteTagsStatement = deleteAlbumTags(currentId);
    await conn.query(deleteTagsStatement.sql, deleteTagsStatement.params);
    for (const tagId of tagIds) {
      const statement = insertAlbumTag(currentId, tagId);
      await conn.query(statement.sql, statement.params);
    }

    const mediaStatement = selectAdminAlbumMediaForSync(currentId);
    const existingMedia = await queryOn<MediaDbRow>(
      conn,
      mediaStatement.sql,
      mediaStatement.params,
    );
    await syncMedia(conn, currentId, existingMedia, input.images, input.videos);

    await recalcTags(conn, [...oldTagIds, ...tagIds]);
    await recalcAuthors(conn, [input.authorId, ...(existing ? [existing.authorId] : [])]);

    return currentId;
  });

  // 首次发布：新建且直接发布，或草稿首次转为发布。
  // 已发布图集再次保存、下架后重新上架不重复通知。
  const firstPublish =
    status === 'published' && (!existing || existing.status === 'draft');

  // 事务提交后再记日志；按新建 / 草稿 / 编辑区分动作。
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

  const detail = await getAdminAlbumDetail(targetId);
  if (firstPublish) {
    // 通知在发布事务提交后执行，失败不回滚发布。
    await notifyAlbumPublished(detail);
  }
  return detail;
}

/**
 * 发布或下架图集。
 *
 * 事务内更新 album.status，并重算该图集关联标签的收录数与作者图集数
 * （二者只统计 published 且未删除的图集，因此状态变化必须同步刷新）。
 * 重复发布保留首次发布时间；下架不移除 published_at。事务后写 album.publish / album.offline 日志。
 */
export async function updateAdminAlbumStatus(
  adminId: number,
  albumId: number,
  status: 'published' | 'offline',
  ip?: string | null,
): Promise<AdminAlbumDetail> {
  const albumStatement = selectAdminAlbumDetail(albumId);
  const album = await dbClient.queryOne<AdminAlbumDbRow>(
    albumStatement.sql,
    albumStatement.params,
  );
  if (!album) {
    throw new HttpError(404, '图集不存在');
  }

  const tagIdsStatement = selectAlbumTagIds(albumId);
  const tagRows = await dbClient.query<AlbumTagIdRow>(
    tagIdsStatement.sql,
    tagIdsStatement.params,
  );
  const tagIds = tagRows.map((row) => Number(row.tagId));

  await dbClient.transaction(async (conn) => {
    if (status === 'published') {
      const publishedAt = album.status === 'published' ? album.publishedAt : toSqlDateTime();
      const statement = publishAdminAlbum(publishedAt, albumId);
      await conn.query(statement.sql, statement.params);
    } else {
      const statement = offlineAdminAlbum(albumId);
      await conn.query(statement.sql, statement.params);
    }
    await recalcTags(conn, tagIds);
    await recalcAuthors(conn, [album.authorId]);
  });

  const action = status === 'published' ? 'album.publish' : 'album.offline';
  await logAdminOp(adminId, action, 'album', albumId, { title: album.title, status }, ip);

  const detail = await getAdminAlbumDetail(albumId);
  // 仅草稿首次发布时通知订阅者；下架后重新上架不重复通知。
  if (status === 'published' && album.status === 'draft') {
    await notifyAlbumPublished(detail);
  }
  return detail;
}

/**
 * 切换图集是否进入瀑布流推荐池（album.is_recommended）。
 *
 * 读取当前值后取反并直接更新；操作日志按结果记为 album.recommend / album.unrecommend。
 */
export async function toggleAdminAlbumRecommend(
  adminId: number,
  albumId: number,
  ip?: string | null,
): Promise<{ isRecommended: boolean }> {
  const albumStatement = selectAdminAlbumRecommend(albumId);
  const album = await dbClient.queryOne<{ id: number; title: string; isRecommended: number }>(
    albumStatement.sql,
    albumStatement.params,
  );
  if (!album) {
    throw new HttpError(404, '图集不存在');
  }
  const next = !toBool(album.isRecommended);
  const updateStatement = updateAdminAlbumRecommend(next ? 1 : 0, albumId);
  await dbClient.execute(updateStatement.sql, updateStatement.params);
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

/**
 * 软删除图集：album 与其全部媒体置 is_deleted = 1，并在同一事务内重算关联标签收录数与作者图集数。
 *
 * 不做物理删除；事务提交后写 album.delete 操作日志。删除不清理已解锁记录、收藏等关联数据。
 */
export async function deleteAdminAlbum(
  adminId: number,
  albumId: number,
  ip?: string | null,
): Promise<void> {
  const albumStatement = selectAdminAlbumDetail(albumId);
  const album = await dbClient.queryOne<AdminAlbumDbRow>(
    albumStatement.sql,
    albumStatement.params,
  );
  if (!album) {
    throw new HttpError(404, '图集不存在');
  }
  const tagIdsStatement = selectAlbumTagIds(albumId);
  const tagRows = await dbClient.query<AlbumTagIdRow>(
    tagIdsStatement.sql,
    tagIdsStatement.params,
  );
  const tagIds = tagRows.map((row) => Number(row.tagId));

  await dbClient.transaction(async (conn) => {
    const deleteAlbumStatement = softDeleteAdminAlbum(albumId);
    await conn.query(deleteAlbumStatement.sql, deleteAlbumStatement.params);
    const deleteMediaStatement = softDeleteAlbumImages(albumId);
    await conn.query(deleteMediaStatement.sql, deleteMediaStatement.params);
    await recalcTags(conn, tagIds);
    await recalcAuthors(conn, [album.authorId]);
  });
  await logAdminOp(adminId, 'album.delete', 'album', albumId, { title: album.title }, ip);
}
