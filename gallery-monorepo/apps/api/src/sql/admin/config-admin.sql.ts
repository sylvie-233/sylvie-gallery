import type { SqlStatement } from '../shared.js';

/** 系统配置键值行。 */
export interface ConfigRow {
  key: string;
  value: string | null;
}

/** 会员套餐行。 */
export interface PlanRow {
  id: number;
  code: string;
  name: string;
  priceCents: number;
  durationDays: number;
  benefits: string | null;
  status: number;
}

/** 友链列表行。 */
export interface FriendLinkRow {
  id: number;
  name: string;
  slogan: string | null;
  url: string;
  sortOrder: number;
}

/** 友链删除前读取的身份行。 */
export interface FriendLinkIdentityRow {
  id: number;
  name: string;
  url: string;
}

export function selectConfigRows(): SqlStatement {
  return {
    sql: `SELECT config_key AS \`key\`, config_value AS value FROM sys_config`,
    params: [],
  };
}

export function selectMonthlyPlan(): SqlStatement {
  return {
    sql: `SELECT id, code, name, price_cents AS priceCents, duration_days AS durationDays,
            benefits, status
       FROM membership_plan
      WHERE code = 'monthly'
      LIMIT 1`,
    params: [],
  };
}

export function selectFriendLinks(): SqlStatement {
  return {
    sql: `SELECT id, name, slogan, url, sort_order AS sortOrder
       FROM friend_link
      WHERE status = 1
      ORDER BY sort_order ASC, id ASC`,
    params: [],
  };
}

export function upsertConfig(key: string, value: string, adminId: number): SqlStatement {
  return {
    sql: `INSERT INTO sys_config (config_key, config_value, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by)`,
    params: [key, value, adminId],
  };
}

export function updateMembershipPlan(
  priceCents: number,
  durationDays: number,
  benefits: string,
  planId: number,
): SqlStatement {
  return {
    sql: `UPDATE membership_plan SET price_cents = ?, duration_days = ?, benefits = ?
      WHERE id = ?`,
    params: [priceCents, durationDays, benefits, planId],
  };
}

export function selectMaxFriendLinkSort(): SqlStatement {
  return {
    sql: `SELECT MAX(sort_order) AS maxSort FROM friend_link`,
    params: [],
  };
}

export function insertFriendLink(
  name: string,
  slogan: string | null,
  url: string,
  sortOrder: number,
): SqlStatement {
  return {
    sql: `INSERT INTO friend_link (name, slogan, url, sort_order, status) VALUES (?, ?, ?, ?, 1)`,
    params: [name, slogan, url, sortOrder],
  };
}

export function selectFriendLinkById(id: number): SqlStatement {
  return {
    sql: `SELECT id, name, url FROM friend_link WHERE id = ? AND status = 1 LIMIT 1`,
    params: [id],
  };
}

export function softDeleteFriendLink(id: number): SqlStatement {
  return {
    sql: `UPDATE friend_link SET status = 0 WHERE id = ?`,
    params: [id],
  };
}
