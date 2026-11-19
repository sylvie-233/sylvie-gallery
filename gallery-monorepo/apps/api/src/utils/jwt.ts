/**
 * JWT 签发与校验：固定 HS256，载荷仅携带用户 ID 与秒级时间戳。
 */
import { sign, verify } from 'hono/jwt';

import { env } from '../config/env.js';

/** JWT 载荷：iat / exp 均为秒级时间戳。 */
export interface TokenPayload {
  userId: number;
  iat?: number;
  exp?: number;
}

/** 签发 JWT。 */
export async function signToken(userId: number): Promise<{ token: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = env.JWT_EXPIRES_IN;
  const token = await sign({ userId, iat: now, exp: now + expiresIn }, env.JWT_SECRET, 'HS256');
  return { token, expiresIn };
}

/** 校验 JWT；失败返回 null。 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const payload = await verify(token, env.JWT_SECRET, 'HS256');
    const userId = Number(payload['userId']);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return null;
    }
    return {
      userId,
      iat: typeof payload['iat'] === 'number' ? payload['iat'] : undefined,
      exp: typeof payload['exp'] === 'number' ? payload['exp'] : undefined,
    };
  } catch {
    return null;
  }
}
