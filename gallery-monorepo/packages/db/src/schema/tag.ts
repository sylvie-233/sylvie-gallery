/**
 * 标签域表结构：标签及收录套数冗余计数。
 * 对应 SQL 设计文件中的 tag。
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

/** 标签：前台展示时统一加 # 前缀；use_count 为收录套数冗余计数。 */
export const tag = mysqlTable(
  'tag',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 32 }).notNull(),
    useCount: int('use_count', { unsigned: true }).notNull().default(0),
    status: tinyint('status', { unsigned: true }).notNull().default(1),
    createdBy: bigint('created_by', { mode: 'number', unsigned: true }),
    isDeleted: tinyint('is_deleted', { unsigned: true }).notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('uk_name').on(table.name),
    index('idx_count').on(table.useCount),
    index('idx_status_count').on(table.status, table.useCount),
  ],
);
