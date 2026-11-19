/**
 * Agent 接入域表结构：供 MCP / Agent 工具访问 API 的令牌（仅存哈希）。
 * 对应 SQL 设计文件中的 agent_token。
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  datetime,
  index,
  mysqlEnum,
  mysqlTable,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/** Agent 访问令牌：明文只在创建时返回，库中仅存哈希与展示前缀。 */
export const agentToken = mysqlTable(
  'agent_token',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 64 }).notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(),
    scope: mysqlEnum('scope', ['read', 'write']).notNull().default('read'),
    status: tinyint('status', { unsigned: true }).notNull().default(1),
    adminId: bigint('admin_id', { mode: 'number', unsigned: true }).notNull(),
    lastUsedAt: datetime('last_used_at', { mode: 'string' }),
    expiresAt: datetime('expires_at', { mode: 'string' }),
    revokedAt: datetime('revoked_at', { mode: 'string' }),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('uk_token_hash').on(table.tokenHash),
    index('idx_admin').on(table.adminId),
    index('idx_status').on(table.status, table.expiresAt),
  ],
);
