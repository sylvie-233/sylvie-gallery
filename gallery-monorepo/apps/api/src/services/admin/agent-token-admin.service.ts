import { createHash, randomBytes } from 'node:crypto';

import type {
  AdminAgentTokenCreateResult,
  AdminAgentTokenRow,
  AgentTokenScope,
} from '@sylvie/types';

import { dbClient } from '../../db/index.js';
import {
  deleteAgentToken as deleteTokenStatement,
  insertAgentToken,
  revokeAgentToken as revokeTokenStatement,
  selectAgentTokenByHash,
  selectAgentTokenById,
  selectAgentTokens,
  touchAgentToken as touchTokenStatement,
  type AgentTokenAuthRow,
  type AgentTokenRow,
} from '../../sql/admin/agent-token.sql.js';
import type { AuthUser } from '../../types/context.js';
import { HttpError } from '../../utils/http.js';
import type { CreateAgentTokenInput } from '../../validators/admin/agent-token.js';
import { logAdminOp } from './log.service.js';

const TOKEN_PREFIX = 'svt_';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toDto(row: AgentTokenRow): AdminAgentTokenRow {
  return {
    id: Number(row.id),
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scope: row.scope,
    status: Number(row.status),
    adminId: Number(row.adminId),
    adminName: row.adminName,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

/** 后台令牌列表；不返回明文。 */
export async function listAgentTokens(): Promise<AdminAgentTokenRow[]> {
  const statement = selectAgentTokens();
  const rows = await dbClient.query<AgentTokenRow>(statement.sql, statement.params);
  return rows.map(toDto);
}

/** 创建令牌：明文只在此处返回一次，库中仅存哈希。 */
export async function createAgentToken(
  adminId: number,
  input: CreateAgentTokenInput,
  ip?: string | null,
): Promise<AdminAgentTokenCreateResult> {
  const token = `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
  const insert = insertAgentToken({
    name: input.name,
    tokenHash: hashToken(token),
    tokenPrefix: `${token.slice(0, 12)}…`,
    scope: input.scope as AgentTokenScope,
    adminId,
    expiresInDays: input.expiresInDays ?? null,
  });
  const result = await dbClient.execute(insert.sql, insert.params);
  const tokenId = Number(result.insertId);

  const select = selectAgentTokenById(tokenId);
  const row = await dbClient.queryOne<AgentTokenRow>(select.sql, select.params);
  if (!row) {
    throw new HttpError(500, '令牌创建失败，请重试');
  }

  await logAdminOp(
    adminId,
    'agent_token.create',
    'agent_token',
    tokenId,
    { name: input.name, scope: input.scope, expiresInDays: input.expiresInDays ?? null },
    ip,
  );

  return { token, item: toDto(row) };
}

/** 吊销令牌：吊销后立即无法用于 MCP。 */
export async function revokeAgentToken(
  adminId: number,
  tokenId: number,
  ip?: string | null,
): Promise<AdminAgentTokenRow> {
  const select = selectAgentTokenById(tokenId);
  const existing = await dbClient.queryOne<AgentTokenRow>(select.sql, select.params);
  if (!existing) {
    throw new HttpError(404, '令牌不存在');
  }
  if (Number(existing.status) === 0) {
    throw new HttpError(409, '令牌已吊销');
  }

  const statement = revokeTokenStatement(tokenId);
  await dbClient.execute(statement.sql, statement.params);

  const updated = await dbClient.queryOne<AgentTokenRow>(select.sql, select.params);
  if (!updated) {
    throw new HttpError(500, '令牌吊销失败，请重试');
  }

  await logAdminOp(
    adminId,
    'agent_token.revoke',
    'agent_token',
    tokenId,
    { name: existing.name, tokenPrefix: existing.tokenPrefix },
    ip,
  );

  return toDto(updated);
}

/** 删除已吊销的令牌；有效令牌必须先吊销。 */
export async function deleteAgentToken(
  adminId: number,
  tokenId: number,
  ip?: string | null,
): Promise<void> {
  const select = selectAgentTokenById(tokenId);
  const existing = await dbClient.queryOne<AgentTokenRow>(select.sql, select.params);
  if (!existing) {
    throw new HttpError(404, '令牌不存在');
  }
  if (Number(existing.status) === 1) {
    throw new HttpError(409, '请先吊销该令牌，再执行删除');
  }

  const statement = deleteTokenStatement(tokenId);
  await dbClient.execute(statement.sql, statement.params);

  await logAdminOp(
    adminId,
    'agent_token.delete',
    'agent_token',
    tokenId,
    { name: existing.name, tokenPrefix: existing.tokenPrefix },
    ip,
  );
}

/** 校验 Agent 令牌，返回令牌与创建管理员身份。 */
export async function authenticateAgentToken(token: string): Promise<{
  tokenId: number;
  scope: AgentTokenScope;
  admin: AuthUser;
} | null> {
  if (!token.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  const statement = selectAgentTokenByHash(hashToken(token));
  const row = await dbClient.queryOne<AgentTokenAuthRow>(statement.sql, statement.params);
  if (!row) {
    return null;
  }
  return {
    tokenId: Number(row.id),
    scope: row.scope,
    admin: {
      id: Number(row.adminId),
      email: row.email,
      nickname: row.nickname,
      role: 'admin',
      vipExpireAt: row.vipExpireAt,
    },
  };
}

/** 记录最近使用时间。 */
export async function touchAgentToken(tokenId: number): Promise<void> {
  const statement = touchTokenStatement(tokenId);
  await dbClient.execute(statement.sql, statement.params);
}
