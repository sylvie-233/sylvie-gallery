import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  smallint,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/** 用户：邮箱注册登录、角色、积分余额与付费会员有效期。 */
export const user = mysqlTable(
  'user',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    email: varchar('email', { length: 128 }).notNull(),
    passwordHash: varchar('password_hash', { length: 128 }).notNull(),
    nickname: varchar('nickname', { length: 16 }).notNull(),
    avatarType: tinyint('avatar_type', { unsigned: true }).notNull().default(0),
    avatarIndex: tinyint('avatar_index', { unsigned: true }).notNull().default(0),
    avatarUrl: varchar('avatar_url', { length: 255 }),
    role: mysqlEnum('role', ['member', 'vip', 'admin']).notNull().default('member'),
    points: int('points', { unsigned: true }).notNull().default(0),
    vipExpireAt: datetime('vip_expire_at', { mode: 'string' }),
    status: tinyint('status', { unsigned: true }).notNull().default(1),
    emailVerified: tinyint('email_verified', { unsigned: true }).notNull().default(0),
    isDeleted: tinyint('is_deleted', { unsigned: true }).notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('uk_email').on(table.email),
    index('idx_role_status').on(table.role, table.status),
  ],
);

/** 每日签到：同一天每个用户只允许一次。 */
export const userCheckin = mysqlTable(
  'user_checkin',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    points: smallint('points', { unsigned: true }).notNull().default(2),
    checkinDate: date('checkin_date', { mode: 'string' }).notNull(),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('uk_user_date').on(table.userId, table.checkinDate),
    index('idx_date').on(table.checkinDate),
  ],
);

/** 用户通知：审核结果 / 作者更新 / 权益变更 / 系统消息。 */
export const userNotification = mysqlTable(
  'user_notification',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
    type: mysqlEnum('type', ['review', 'update', 'benefit', 'system']).notNull().default('system'),
    title: varchar('title', { length: 128 }).notNull(),
    content: varchar('content', { length: 1000 }).notNull(),
    albumId: bigint('album_id', { mode: 'number', unsigned: true }),
    isRead: tinyint('is_read', { unsigned: true }).notNull().default(0),
    readAt: datetime('read_at', { mode: 'string' }),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_user_read').on(table.userId, table.isRead, table.id),
    index('idx_user_type').on(table.userId, table.type, table.id),
  ],
);

/** 邮箱验证码：注册 / 找回密码，一次性使用。 */
export const verifyCode = mysqlTable(
  'verify_code',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    email: varchar('email', { length: 128 }).notNull(),
    scene: mysqlEnum('scene', ['register', 'reset_password']).notNull().default('register'),
    code: varchar('code', { length: 8 }).notNull(),
    expiredAt: datetime('expired_at', { mode: 'string' }).notNull(),
    usedAt: datetime('used_at', { mode: 'string' }),
    createdAt: datetime('created_at', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_email_scene').on(table.email, table.scene, table.createdAt)],
);
