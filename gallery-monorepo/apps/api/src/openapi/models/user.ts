/**
 * 前台用户与认证响应模型：用户资料、登录 / 注册结果、验证码与签到。
 */
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
    // role 为数据库中的角色；effectiveRole 为按 vip_expire_at 计算后的实际角色。
    role: roleSchema,
    effectiveRole: effectiveRoleSchema,
    // 当前「解锁积分」余额，不会为负。
    points: z.number().int(),
    // 会员到期时间（北京时间），非会员为 null。
    vipExpireAt: z.string().nullable(),
    emailVerified: z.boolean(),
    createdAt: z.string(),
    // 未读通知数，用于前台红点。
    unreadCount: z.number().int(),
    isVip: z.boolean(),
  })
  .openapi('UserProfile');

/** 登录 / 注册结果。 */
export const AuthResultSchema = z
  .object({
    token: z.string().openapi({ description: 'JWT 访问令牌' }),
    tokenType: z.literal('Bearer'),
    // JWT 有效期（秒），前端据此决定何时重新登录。
    expiresIn: z.number().int().openapi({ description: '有效期（秒）' }),
    profile: UserProfileSchema,
  })
  .openapi('AuthResult');

/** 发送验证码结果。 */
export const SendCodeResultSchema = z
  .object({
    sent: z.boolean(),
    // 验证码有效期（秒）。
    expiresIn: z.number().int().openapi({ description: '有效期（秒）' }),
    // 开发环境回传固定验证码 123456，生产环境不返回。
    demoCode: z.string().optional().openapi({ description: '仅开发环境返回的固定验证码' }),
  })
  .openapi('SendCodeResult');

/** 今日签到状态。 */
export const CheckinStatusSchema = z
  .object({
    // 今日是否已签到；dailyPoints 为签到可得积分（sys_config.checkin.points，默认 2）。
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
