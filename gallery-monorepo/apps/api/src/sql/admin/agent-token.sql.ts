/**
 * Agent / MCP 令牌的参数化 SQL：列表、创建、按哈希校验、吊销、最近使用时间与删除。
 *
 * 数据库只保存令牌哈希；校验时同时约束令牌状态、有效期与创建管理员身份。
 */
import type { SqlStatement } from '../shared.js';

/** 后台令牌行。 */
export interface AgentTokenRow {
  id: number;
  name: string;
  tokenPrefix: string;
  scope: 'read' | 'write';
  status: number;
  adminId: number;
  adminName: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** 令牌校验行：附带创建管理员身份。 */
export interface AgentTokenAuthRow {
  id: number;
  scope: 'read' | 'write';
  adminId: number;
  email: string;
  nickname: string;
  vipExpireAt: string | null;
}

const TOKEN_SELECT = `t.id, t.name, t.token_prefix AS tokenPrefix, t.scope, t.status,
  t.admin_id AS adminId, u.nickname AS adminName, t.last_used_at AS lastUsedAt,
  t.expires_at AS expiresAt, t.revoked_at AS revokedAt, t.created_at AS createdAt`;

/** 后台令牌列表。 */
export function selectAgentTokens(): SqlStatement {
  return {
    sql: `SELECT ${TOKEN_SELECT}
       FROM agent_token t
       JOIN \`user\` u ON u.id = t.admin_id
      ORDER BY t.id DESC`,
    params: [],
  };
}

/** 按主键查询令牌。 */
export function selectAgentTokenById(id: number): SqlStatement {
  return {
    sql: `SELECT ${TOKEN_SELECT}
       FROM agent_token t
       JOIN \`user\` u ON u.id = t.admin_id
      WHERE t.id = ?
      LIMIT 1`,
    params: [id],
  };
}

/**
 * 新增令牌，status 直接置 1。
 *
 * expiresInDays 为空时 expires_at 写 NULL（长期有效），否则用 DATE_ADD(NOW(), INTERVAL ? DAY)
 * 计算；SQL 片段随是否传入有效期而切换，占位符数量同步变化。
 */
export function insertAgentToken(input: {
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  scope: 'read' | 'write';
  adminId: number;
  expiresInDays?: number | null;
}): SqlStatement {
  const hasExpiry = input.expiresInDays !== null && input.expiresInDays !== undefined;
  return {
    sql: `INSERT INTO agent_token
            (name, token_hash, token_prefix, scope, status, admin_id, expires_at)
          VALUES (?, ?, ?, ?, 1, ?, ${hasExpiry ? 'DATE_ADD(NOW(), INTERVAL ? DAY)' : 'NULL'})`,
    params: hasExpiry
      ? [
          input.name,
          input.tokenHash,
          input.tokenPrefix,
          input.scope,
          input.adminId,
          input.expiresInDays,
        ]
      : [input.name, input.tokenHash, input.tokenPrefix, input.scope, input.adminId],
  };
}

/**
 * 按哈希校验令牌。
 *
 * 约束：令牌 status = 1、未设置过期或未过期，且创建者未删除、status = 1、role = 'admin'。
 * 返回 scope 与创建管理员身份，供 MCP 鉴权与写权限判断。
 */
export function selectAgentTokenByHash(tokenHash: string): SqlStatement {
  return {
    sql: `SELECT t.id, t.scope, t.admin_id AS adminId,
              u.email, u.nickname, u.vip_expire_at AS vipExpireAt
         FROM agent_token t
         JOIN \`user\` u ON u.id = t.admin_id
        WHERE t.token_hash = ?
          AND t.status = 1
          AND (t.expires_at IS NULL OR t.expires_at > NOW())
          AND u.is_deleted = 0
          AND u.status = 1
          AND u.role = 'admin'
        LIMIT 1`,
    params: [tokenHash],
  };
}

/** 吊销令牌：仅对启用中的令牌生效，置 status = 0 并记录 revoked_at。 */
export function revokeAgentToken(id: number): SqlStatement {
  return {
    sql: `UPDATE agent_token
              SET status = 0, revoked_at = NOW()
            WHERE id = ? AND status = 1`,
    params: [id],
  };
}

/** 记录令牌最近使用时间。 */
export function touchAgentToken(id: number): SqlStatement {
  return {
    sql: `UPDATE agent_token SET last_used_at = NOW() WHERE id = ?`,
    params: [id],
  };
}

/** 删除已吊销的令牌：附带 status = 0 条件，防止误删有效令牌。 */
export function deleteAgentToken(id: number): SqlStatement {
  return {
    sql: `DELETE FROM agent_token WHERE id = ? AND status = 0`,
    params: [id],
  };
}
