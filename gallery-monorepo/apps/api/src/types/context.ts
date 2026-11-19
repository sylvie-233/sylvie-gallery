import type { Context } from 'hono';

import type { Logger } from '@sylvie/logger';
import type { Role } from '@sylvie/types';

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
  };
}

export type AppContext = Context<AppEnv>;
