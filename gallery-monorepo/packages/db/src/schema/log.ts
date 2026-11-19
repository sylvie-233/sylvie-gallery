/**
 * 行为日志域表结构：浏览、下载、搜索记录，用于统计与风控。
 * 对应 SQL 设计文件中的 user_view_log / download_log / search_log。
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  varchar,
} from 'drizzle-orm/mysql-core';

/** 浏览记录：PV/UV 与瀑布流个人推荐的偏好来源。 */
export const userViewLog = mysqlTable(
  'user_view_log',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }),
    visitorId: varchar('visitor_id', { length: 64 }),
    albumId: bigint('album_id', { mode: 'number', unsigned: true }).notNull(),
    viewDate: date('view_date', { mode: 'string' }).notNull(),
    ip: varchar('ip', { length: 45 }),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_album_date').on(table.albumId, table.viewDate),
    index('idx_user_time').on(table.userId, table.createdAt),
    index('idx_visitor').on(table.visitorId, table.viewDate),
  ],
);

/** 下载记录：下载次数统计与按日限次风控。 */
export const downloadLog = mysqlTable(
  'download_log',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    albumId: bigint('album_id', { mode: 'number', unsigned: true }).notNull(),
    downloadDate: date('download_date', { mode: 'string' }).notNull(),
    ip: varchar('ip', { length: 45 }),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_user_date').on(table.userId, table.downloadDate),
    index('idx_album_date').on(table.albumId, table.downloadDate),
  ],
);

/** 搜索日志：图集 / 公告 / 作者三个场景的热词统计。 */
export const searchLog = mysqlTable(
  'search_log',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    scene: mysqlEnum('scene', ['album', 'announcement', 'author']).notNull().default('album'),
    keyword: varchar('keyword', { length: 64 }).notNull(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }),
    resultCount: int('result_count', { unsigned: true }).notNull().default(0),
    searchDate: date('search_date', { mode: 'string' }).notNull(),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_scene_kw').on(table.scene, table.keyword, table.searchDate),
    index('idx_date').on(table.searchDate),
  ],
);
