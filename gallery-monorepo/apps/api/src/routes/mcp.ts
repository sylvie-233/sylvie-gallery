import { Hono } from 'hono';

import { handleMcpRequest } from '../mcp/handler.js';
import { requireAdmin } from '../middleware/auth.js';
import { authenticateMcp } from '../middleware/mcp-auth.js';
import type { AppEnv } from '../types/context.js';

const router = new Hono<AppEnv>();

/** MCP 端点：Agent 令牌（X-API-Key / Bearer）或管理员 JWT，均需管理员身份。 */
router.use('*', authenticateMcp, requireAdmin);
router.all('*', (c) => handleMcpRequest(c));

export default router;
