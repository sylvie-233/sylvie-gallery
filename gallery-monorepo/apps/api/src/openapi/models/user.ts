import { z } from '@hono/zod-openapi';

import { effectiveRoleSchema, roleSchema } from './common.js';

/** 当前用户资料：GET /api/auth/me、登录/注册结果与资料更新共用。 */
export const UserProfileSchema = z
  .object({
    id: z.number().int(),
    email: z.string(),
    nickname: z.string(),
    avatarType: z.number().int().openapi({ description: '0=预设色卡 1=自定义上传' }),
    avatarIndex: z.number().int().min(0).max(7),
    avatarUrl: z.string().nullable(),
    role: roleSchema,
    effectiveRole: effectiveRoleSchema,
    points: z.number().int(),
    vipExpireAt: z.string().nullable(),
    emailVerified: z.boolean(),
    createdAt: z.string(),
    unreadCount: z.number().int(),
    isVip: z.boolean(),
  })
  .openapi('UserProfile');

/** 登录 / 注册结果。 */
export const AuthResultSchema = z
  .object({
    token: z.string().openapi({ description: 'JWT 访问令牌' }),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number().int().openapi({ description: '有效期（秒）' }),
    profile: UserProfileSchema,
  })
  .openapi('AuthResult');

/** 发送验证码结果。 */
export const SendCodeResultSchema = z
  .object({
    sent: z.boolean(),
    expiresIn: z.number().int().openapi({ description: '有效期（秒）' }),
    demoCode: z.string().optional().openapi({ description: '仅开发环境返回的固定验证码' }),
  })
  .openapi('SendCodeResult');

/** 今日签到状态。 */
export const CheckinStatusSchema = z
  .object({
    checkedIn: z.boolean(),
    dailyPoints: z.number().int(),
  })
  .openapi('CheckinStatus');

/** 签到结果。 */
export const CheckinResultSchema = z
  .object({
    checkin: z.boolean(),
    points: z.number().int().openapi({ description: '本次获得积分' }),
    totalPoints: z.number().int().openapi({ description: '签到后积分余额' }),
    message: z.string(),
  })
  .openapi('CheckinResult');
