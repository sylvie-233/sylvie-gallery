import { sql } from 'drizzle-orm';
import {
  bigint,
  datetime,
  index,
  mysqlEnum,
  mysqlTable,
  smallint,
  text,
  tinyint,
  varchar,
} from 'drizzle-orm/mysql-core';

/** 公告：列表按置顶优先 + 发布时间排序；正文为分段文本。 */
export const announcement = mysqlTable(
  'announcement',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    type: mysqlEnum('type', ['update', 'activity', 'maintain', 'rule', 'notice'])
      .notNull()
      .default('notice'),
    title: varchar('title', { length: 128 }).notNull(),
    summary: varchar('summary', { length: 255 }),
    content: text('content'),
    isTop: tinyint('is_top', { unsigned: true }).notNull().default(0),
    status: tinyint('status', { unsigned: true }).notNull().default(1),
    publishedAt: datetime('published_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdBy: bigint('created_by', { mode: 'number', unsigned: true }).notNull(),
    isDeleted: tinyint('is_deleted', { unsigned: true }).notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_status_top').on(table.status, table.isTop, table.publishedAt)],
);

/** 评论/回复：先审后发；parent_id 为空表示一级评论。 */
export const comment = mysqlTable(
  'comment',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    albumId: bigint('album_id', { mode: 'number', unsigned: true }).notNull(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    parentId: bigint('parent_id', { mode: 'number', unsigned: true }),
    replyToUserId: bigint('reply_to_user_id', { mode: 'number', unsigned: true }),
    content: varchar('content', { length: 500 }).notNull(),
    status: mysqlEnum('status', ['pending', 'approved', 'rejected', 'deleted'])
      .notNull()
      .default('pending'),
    isDeleted: tinyint('is_deleted', { unsigned: true }).notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_album_status').on(table.albumId, table.status, table.createdAt),
    index('idx_user').on(table.userId),
    index('idx_parent').on(table.parentId),
  ],
);

/** 友情链接：页脚胶囊，按 sort_order 升序展示。 */
export const friendLink = mysqlTable(
  'friend_link',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 32 }).notNull(),
    slogan: varchar('slogan', { length: 64 }),
    url: varchar('url', { length: 255 }).notNull(),
    sortOrder: smallint('sort_order', { unsigned: true }).notNull().default(0),
    status: tinyint('status', { unsigned: true }).notNull().default(1),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_status_sort').on(table.status, table.sortOrder)],
);
