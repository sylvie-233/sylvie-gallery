/**
 * 后台 Agent / MCP 访问令牌管理：列表、创建、吊销、删除，以及 MCP 请求时的令牌校验。
 *
 * 令牌明文只在创建时返回一次，数据库仅保存 SHA-256 哈希与可展示的前缀；吊销后立即失效。
 */
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

/** 计算令牌的 SHA-256 十六进制哈希；库中不存明文。 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 将令牌行转换为 DTO，并把 BIGINT 主键 / 外键转为 number。 */
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

/**
 * 后台令牌列表，按创建时间倒序。
 *
 * 仅返回前缀与元数据，不返回明文或哈希；包含已吊销、已过期的令牌。
 */
export async function listAgentTokens(): Promise<AdminAgentTokenRow[]> {
  const statement = selectAgentTokens();
  const rows = await dbClient.query<AgentTokenRow>(statement.sql, statement.params);
  return rows.map(toDto);
}

/**
 * 创建 Agent 令牌。
 *
 * 生成 `svt_` 前缀的随机明文，仅本次响应返回；库中保存 SHA-256 哈希与 `svt_xxxxxxxx…` 展示前缀。
 * expiresInDays 为空表示长期有效。写入后记录 agent_token.create 操作日志（不含明文）。
 */
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

/**
 * 吊销令牌：status 置 0 并记录 revoked_at，吊销后立即无法通过 MCP 校验。
 *
 * 已吊销的令牌重复吊销抛 409；操作写入 agent_token.revoke 日志。
 */
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

/**
 * 删除令牌记录（物理删除）。
 *
 * 仅允许删除已吊销（status = 0）的令牌；有效令牌须先吊销，否则抛 409。
 * 操作写入 agent_token.delete 日志。
 */
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

/**
 * 校验 MCP 请求携带的 Agent 令牌。
 *
 * 要求令牌前缀为 `svt_`、哈希命中、状态启用、未过期，且创建者仍是未删除、状态正常的 admin。
 * 校验通过返回令牌 ID、scope 与管理员身份；任一条件不满足返回 null（由调用方返回 401）。
 * 本函数只读，不更新最近使用时间。
 */
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

/** 记录令牌最近使用时间（last_used_at）；失败由调用方决定是否忽略。 */
export async function touchAgentToken(tokenId: number): Promise<void> {
  const statement = touchTokenStatement(tokenId);
  await dbClient.execute(statement.sql, statement.params);
}
