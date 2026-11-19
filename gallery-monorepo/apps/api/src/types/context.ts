/**
 * 请求上下文类型：声明 Hono 环境变量中的登录用户、请求级日志与 Agent 令牌。
 */
import type { Context } from 'hono';

import type { Logger } from '@sylvie/logger';
import type { AgentTokenScope, Role } from '@sylvie/types';

/** 当前请求的登录用户（由鉴权中间件注入）。 */
export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
  role: Role;
  vipExpireAt: string | null;
}

/** Hono 应用环境变量：currentUser 在可选鉴权下不存在。 */
export interface AppEnv {
  Variables: {
    currentUser?: AuthUser;
    /** 请求级子日志，由 requestLogger 中间件注入。 */
    logger?: Logger;
    /** MCP 请求使用的 Agent 令牌（JWT 登录时为空）。 */
    agentToken?: { id: number; scope: AgentTokenScope };
  };
}

/** 业务处理器使用的 Hono 上下文类型别名。 */
export type AppContext = Context<AppEnv>;
