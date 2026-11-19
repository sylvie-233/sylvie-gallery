import {
  createAgentToken,
  deleteAgentToken,
  listAgentTokens,
  revokeAgentToken,
} from '../../services/admin/agent-token-admin.service.js';
import type { AppContext } from '../../types/context.js';
import { success } from '../../utils/http.js';
import type { CreateAgentTokenInput } from '../../validators/admin/agent-token.js';
import { adminOperator } from './helpers.js';

/** GET /api/admin/agent-tokens */
export async function list(c: AppContext): Promise<Response> {
  return success(c, await listAgentTokens());
}

/** POST /api/admin/agent-tokens */
export async function create(c: AppContext, input: CreateAgentTokenInput): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await createAgentToken(operator.adminId, input, operator.ip),
    '令牌已创建，请立即复制保存',
    201,
  );
}

/** POST /api/admin/agent-tokens/:id/revoke */
export async function revoke(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  return success(
    c,
    await revokeAgentToken(operator.adminId, id, operator.ip),
    '令牌已吊销',
  );
}

/** DELETE /api/admin/agent-tokens/:id */
export async function remove(c: AppContext, id: number): Promise<Response> {
  const operator = adminOperator(c);
  await deleteAgentToken(operator.adminId, id, operator.ip);
  return success(c, null, '令牌已删除');
}
