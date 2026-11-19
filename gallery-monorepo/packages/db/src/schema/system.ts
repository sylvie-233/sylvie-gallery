/**
 * 系统域表结构：站点配置、字典类型/字典项、管理后台操作日志。
 * 对应 SQL 设计文件中的 sys_config / sys_dict_type / sys_dict_data / admin_op_log。
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  datetime,
  index,
  mysqlTable,
  smallint,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/** 站点配置：键值对，值可以是字符串或 JSON。 */
export const sysConfig = mysqlTable(
  'sys_config',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    configKey: varchar('config_key', { length: 64 }).notNull(),
    configValue: text('config_value'),
    remark: varchar('remark', { length: 255 }),
    updatedBy: bigint('updated_by', { mode: 'number', unsigned: true }),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('uk_config_key').on(table.configKey)],
);

/** 字典类型：业务枚举的「值 → 文案/样式」配置来源。 */
export const sysDictType = mysqlTable(
  'sys_dict_type',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    typeCode: varchar('type_code', { length: 64 }).notNull(),
    typeName: varchar('type_name', { length: 64 }).notNull(),
    remark: varchar('remark', { length: 255 }),
    status: tinyint('status', { unsigned: true }).notNull().default(1),
    isSystem: tinyint('is_system', { unsigned: true }).notNull().default(0),
    isDeleted: tinyint('is_deleted', { unsigned: true }).notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('uk_type_code').on(table.typeCode)],
);

/** 字典项：同类型下值唯一；样式类供前端标签配色。 */
export const sysDictData = mysqlTable(
  'sys_dict_data',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    typeCode: varchar('type_code', { length: 64 }).notNull(),
    dictValue: varchar('dict_value', { length: 32 }).notNull(),
    dictLabel: varchar('dict_label', { length: 64 }).notNull(),
    styleClass: varchar('style_class', { length: 32 }),
    extra: varchar('extra', { length: 255 }),
    sortOrder: smallint('sort_order', { unsigned: true }).notNull().default(0),
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
    uniqueIndex('uk_type_value').on(table.typeCode, table.dictValue),
    index('idx_type_sort').on(table.typeCode, table.status, table.sortOrder),
  ],
);

/** 管理操作日志：后台所有写操作留痕，detail 为 JSON。 */
export const adminOpLog = mysqlTable(
  'admin_op_log',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    adminId: bigint('admin_id', { mode: 'number', unsigned: true }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    targetType: varchar('target_type', { length: 32 }),
    targetId: bigint('target_id', { mode: 'number', unsigned: true }),
    detail: varchar('detail', { length: 1000 }),
    ip: varchar('ip', { length: 45 }),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_admin_time').on(table.adminId, table.createdAt),
    index('idx_target').on(table.targetType, table.targetId),
  ],
);
