/**
 * 后台站点配置的参数化 SQL：sys_config 键值读写、月度会员套餐、友情链接增删查。
 *
 * sys_config 使用 ON DUPLICATE KEY UPDATE 实现按键 upsert；友链删除为 status 置 0 的软删除。
 */
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

/** 读取全部系统配置键值，由 service 组装为映射。 */
export function selectConfigRows(): SqlStatement {
  return {
    sql: `SELECT config_key AS \`key\`, config_value AS value FROM sys_config`,
    params: [],
  };
}

/** 读取固定 code = 'monthly' 的月度会员套餐（v1 只有这一档）。 */
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

/** 读取启用中的友情链接，按 sort_order 升序、id 升序。 */
export function selectFriendLinks(): SqlStatement {
  return {
    sql: `SELECT id, name, slogan, url, sort_order AS sortOrder
       FROM friend_link
      WHERE status = 1
      ORDER BY sort_order ASC, id ASC`,
    params: [],
  };
}

/**
 * 按键 upsert 配置：不存在则插入，存在则覆盖值并记录最后修改人。
 * 依赖 config_key 唯一索引触发 ON DUPLICATE KEY UPDATE。
 */
export function upsertConfig(key: string, value: string, adminId: number): SqlStatement {
  return {
    sql: `INSERT INTO sys_config (config_key, config_value, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by)`,
    params: [key, value, adminId],
  };
}

/** 更新会员套餐价格（分）、时长（天）与权益 JSON 文本。 */
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

/** 读取当前最大排序值，用于新增友链时追加到末尾；空表返回 NULL。 */
export function selectMaxFriendLinkSort(): SqlStatement {
  return {
    sql: `SELECT MAX(sort_order) AS maxSort FROM friend_link`,
    params: [],
  };
}

/** 新增启用中的友情链接（status 1）。 */
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

/** 删除前读取启用中的友链身份（id / 名称 / URL）。 */
export function selectFriendLinkById(id: number): SqlStatement {
  return {
    sql: `SELECT id, name, url FROM friend_link WHERE id = ? AND status = 1 LIMIT 1`,
    params: [id],
  };
}

/** 软删除友链：status 置 0，读取列表时不再返回。 */
export function softDeleteFriendLink(id: number): SqlStatement {
  return {
    sql: `UPDATE friend_link SET status = 0 WHERE id = ?`,
    params: [id],
  };
}
