/**
 * 作者域表结构：作者资料（含收录数冗余）与用户订阅关系。
 * 对应 SQL 设计文件中的 author / subscription。
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  datetime,
  index,
  int,
  mysqlTable,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/** 作者：由管理员维护，封面/头像为空时前台使用渐变色卡。 */
export const author = mysqlTable(
  'author',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 32 }).notNull(),
    alias: varchar('alias', { length: 64 }),
    initial: varchar('initial', { length: 8 }).notNull().default(''),
    avatarUrl: varchar('avatar_url', { length: 255 }),
    coverUrl: varchar('cover_url', { length: 255 }),
    color: varchar('color', { length: 16 }).notNull().default('#3a3a44'),
    bio: varchar('bio', { length: 500 }),
    styleTags: varchar('style_tags', { length: 128 }),
    albumCount: int('album_count', { unsigned: true }).notNull().default(0),
    lastUpdateAt: datetime('last_update_at', { mode: 'string' }),
    sortWeight: int('sort_weight').notNull().default(0),
    status: tinyint('status', { unsigned: true }).notNull().default(1),
    isDeleted: tinyint('is_deleted', { unsigned: true }).notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_name').on(table.name),
    index('idx_status_sort').on(table.status, table.sortWeight, table.id),
  ],
);

/** 作者订阅：防重复订阅，作者更新时可批量发通知。 */
export const subscription = mysqlTable(
  'subscription',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    authorId: bigint('author_id', { mode: 'number', unsigned: true }).notNull(),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('uk_user_author').on(table.userId, table.authorId),
    index('idx_author').on(table.authorId),
    index('idx_user_time').on(table.userId, table.createdAt),
  ],
);
