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

/** 新增令牌。 */
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

/** 按哈希校验令牌：令牌启用、未过期、创建管理员仍为正常管理员。 */
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

/** 吊销令牌。 */
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
