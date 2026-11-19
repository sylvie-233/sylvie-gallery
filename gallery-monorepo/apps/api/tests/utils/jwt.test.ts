/**
 * JWT 签发 / 校验测试：正常往返、篡改、过期与非法载荷。
 */
import { sign, verify } from 'hono/jwt';
import { describe, expect, it } from 'vitest';

import { env } from '../../src/config/env.js';
import { signToken, verifyToken } from '../../src/utils/jwt.js';

describe('signToken', () => {
  it('签发 HS256 令牌并返回有效期', async () => {
    const { token, expiresIn } = await signToken(42);
    expect(token.split('.')).toHaveLength(3);
    expect(expiresIn).toBe(env.JWT_EXPIRES_IN);

    const payload = await verify(token, env.JWT_SECRET, 'HS256');
    expect(payload['userId']).toBe(42);
    expect(payload['exp']).toBeGreaterThan(payload['iat'] as number);
  });
});

describe('verifyToken', () => {
  it('校验通过后返回 userId 与时间戳', async () => {
    const { token } = await signToken(9);
    const payload = await verifyToken(token);
    expect(payload).toMatchObject({ userId: 9 });
    expect(payload?.iat).toBeTypeOf('number');
    expect(payload?.exp).toBeTypeOf('number');
  });

  it('篡改后的令牌返回 null', async () => {
    const { token } = await signToken(1);
    expect(await verifyToken(`${token}tampered`)).toBeNull();
  });

  it('使用其它密钥签发的令牌返回 null', async () => {
    const token = await sign({ userId: 1 }, 'another-secret-at-least-16', 'HS256');
    expect(await verifyToken(token)).toBeNull();
  });

  it('过期令牌返回 null', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { userId: 1, iat: now - 120, exp: now - 60 },
      env.JWT_SECRET,
      'HS256',
    );
    expect(await verifyToken(token)).toBeNull();
  });

  it('userId 非正整数时返回 null', async () => {
    for (const userId of ['abc', 0, -1, 1.5]) {
      const token = await sign({ userId }, env.JWT_SECRET, 'HS256');
      expect(await verifyToken(token)).toBeNull();
    }
  });
});
