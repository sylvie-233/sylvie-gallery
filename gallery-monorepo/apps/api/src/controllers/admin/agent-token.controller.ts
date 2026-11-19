/**
 * 后台 Agent 令牌控制器：列表、创建、吊销与删除。
 * 写操作传入操作管理员与 IP，由 service 统一写管理日志。
 */
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

/** GET /api/admin/agent-tokens —— 返回令牌列表，不包含明文令牌。 */
export async function list(c: AppContext) {
  return success(c, await listAgentTokens());
}

/** POST /api/admin/agent-tokens —— 入参来自校验后的 body；明文令牌只在本次响应返回。 */
export async function create(c: AppContext, input: CreateAgentTokenInput) {
  const operator = adminOperator(c);
  return success(
    c,
    await createAgentToken(operator.adminId, input, operator.ip),
    '令牌已创建，请立即复制保存',
    201,
  );
}

/** POST /api/admin/agent-tokens/:id/revoke —— 吊销后令牌立即失效，service 写入管理日志。 */
export async function revoke(c: AppContext, id: number) {
  const operator = adminOperator(c);
  return success(
    c,
    await revokeAgentToken(operator.adminId, id, operator.ip),
    '令牌已吊销',
  );
}

/** DELETE /api/admin/agent-tokens/:id —— 仅允许删除已吊销令牌，删除操作写管理日志。 */
export async function remove(c: AppContext, id: number) {
  const operator = adminOperator(c);
  await deleteAgentToken(operator.adminId, id, operator.ip);
  return success(c, null, '令牌已删除');
}
