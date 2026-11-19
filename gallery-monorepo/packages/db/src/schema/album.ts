/**
 * 图集域表结构：图集主表、图片/视频媒体、标签关联、积分解锁与收藏。
 * 对应 SQL 设计文件中的 album / album_image / album_tag / album_unlock / favorite。
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  datetime,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  smallint,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/** 图集：发布状态、推荐池标记与列表页所需的冗余计数。 */
export const album = mysqlTable(
  'album',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    authorId: bigint('author_id', { mode: 'number', unsigned: true }).notNull(),
    title: varchar('title', { length: 128 }).notNull(),
    description: varchar('description', { length: 1000 }),
    coverUrl: varchar('cover_url', { length: 255 }).notNull(),
    imageCount: int('image_count', { unsigned: true }).notNull().default(0),
    videoCount: tinyint('video_count', { unsigned: true }).notNull().default(0),
    packageSize: decimal('package_size', { precision: 10, scale: 2 }).notNull().default('0.00'),
    points: smallint('points', { unsigned: true }).notNull().default(0),
    viewCount: int('view_count', { unsigned: true }).notNull().default(0),
    downloadCount: int('download_count', { unsigned: true }).notNull().default(0),
    favCount: int('fav_count', { unsigned: true }).notNull().default(0),
    commentCount: int('comment_count', { unsigned: true }).notNull().default(0),
    isRecommended: tinyint('is_recommended', { unsigned: true }).notNull().default(0),
    status: mysqlEnum('status', ['draft', 'published', 'offline']).notNull().default('draft'),
    publishedAt: datetime('published_at', { mode: 'string' }),
    createdBy: bigint('created_by', { mode: 'number', unsigned: true }).notNull(),
    isDeleted: tinyint('is_deleted', { unsigned: true }).notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_author_status').on(table.authorId, table.status, table.publishedAt),
    index('idx_pub_new').on(table.status, table.publishedAt, table.id),
    index('idx_pub_hot').on(table.status, table.viewCount, table.id),
    index('idx_pub_fav').on(table.status, table.favCount, table.id),
    index('idx_pub_rec').on(table.status, table.isRecommended, table.publishedAt),
    index('idx_created_by').on(table.createdBy),
  ],
);

/** 图集媒体：图片与视频；1-3 为未解锁预览位。 */
export const albumImage = mysqlTable(
  'album_image',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    albumId: bigint('album_id', { mode: 'number', unsigned: true }).notNull(),
    mediaType: mysqlEnum('media_type', ['image', 'video']).notNull().default('image'),
    url: varchar('url', { length: 255 }).notNull(),
    thumbUrl: varchar('thumb_url', { length: 255 }),
    watermarkUrl: varchar('watermark_url', { length: 255 }),
    width: smallint('width', { unsigned: true }),
    height: smallint('height', { unsigned: true }),
    duration: smallint('duration', { unsigned: true }),
    sortOrder: smallint('sort_order', { unsigned: true }).notNull().default(0),
    isDeleted: tinyint('is_deleted', { unsigned: true }).notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_album_sort').on(table.albumId, table.mediaType, table.sortOrder)],
);

/** 图集-标签关联：用于标签筛选与详情页标签 chips。 */
export const albumTag = mysqlTable(
  'album_tag',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    albumId: bigint('album_id', { mode: 'number', unsigned: true }).notNull(),
    tagId: bigint('tag_id', { mode: 'number', unsigned: true }).notNull(),
  },
  (table) => [
    uniqueIndex('uk_album_tag').on(table.albumId, table.tagId),
    index('idx_tag_album').on(table.tagId, table.albumId),
  ],
);

/** 图集解锁：同一图集只解锁一次，是「未解锁只看前 3 张」的判定依据。 */
export const albumUnlock = mysqlTable(
  'album_unlock',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    albumId: bigint('album_id', { mode: 'number', unsigned: true }).notNull(),
    orderId: bigint('order_id', { mode: 'number', unsigned: true }),
    pointsCost: smallint('points_cost', { unsigned: true }).notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('uk_user_album').on(table.userId, table.albumId),
    index('idx_user_time').on(table.userId, table.createdAt),
    index('idx_album').on(table.albumId),
  ],
);

/** 收藏：防重复收藏，图集页「收藏」排序的计数来源。 */
export const favorite = mysqlTable(
  'favorite',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    albumId: bigint('album_id', { mode: 'number', unsigned: true }).notNull(),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('uk_user_album').on(table.userId, table.albumId),
    index('idx_user_time').on(table.userId, table.createdAt),
    index('idx_album').on(table.albumId),
  ],
);
