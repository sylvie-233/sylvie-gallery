import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  toggleAdminAlbumRecommend,
  updateAdminAlbumStatus,
} from '../../services/admin/album-admin.service.js';
import { toggleAdminAnnouncement } from '../../services/admin/announcement-admin.service.js';
import { toggleAdminAuthor } from '../../services/admin/author-admin.service.js';
import { reviewAdminComment } from '../../services/admin/comment-admin.service.js';
import {
  getAdminConfigBundle,
  updateAdminPlan,
  updateAdminSiteConfig,
} from '../../services/admin/config-admin.service.js';
import { createAdminTag, toggleAdminTag } from '../../services/admin/tag-admin.service.js';
import {
  adjustAdminUserPoints,
  grantAdminUserVip,
  toggleAdminUserStatus,
} from '../../services/admin/user-admin.service.js';
import type { AuthUser } from '../../types/context.js';
import { jsonResult } from '../result.js';

const idInput = { id: z.number().int().positive().describe('ID') };

const siteConfigInput = {
  copyright: z.string().max(255).optional(),
  icpNo: z.string().max(64).optional(),
  ageStatement: z.string().max(255).optional(),
  disclaimer: z.string().max(255).optional(),
  checkinPoints: z.number().int().min(1).max(99).optional(),
  watermarkOn: z.boolean().optional(),
};

/** 注册写操作工具：仅在 MCP_ALLOW_WRITE 开启时可用。 */
export function registerWriteTools(server: McpServer, admin: AuthUser): void {
  server.registerTool(
    'admin_update_album_status',
    {
      title: '发布 / 下架图集',
      description: '将图集设为 published（上架）或 offline（下架），会写入管理操作日志。',
      inputSchema: { ...idInput, status: z.enum(['published', 'offline']) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id, status }) =>
      jsonResult(await updateAdminAlbumStatus(admin.id, id, status, undefined)),
  );

  server.registerTool(
    'admin_toggle_album_recommend',
    {
      title: '切换图集推荐池',
      description: '在瀑布流推荐池中加入 / 移出图集。',
      inputSchema: idInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ id }) => jsonResult(await toggleAdminAlbumRecommend(admin.id, id, undefined)),
  );

  server.registerTool(
    'admin_review_comment',
    {
      title: '审核评论',
      description: '审核通过或拒绝一条待审核评论。',
      inputSchema: { ...idInput, status: z.enum(['approved', 'rejected']) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id, status }) =>
      jsonResult(await reviewAdminComment(admin.id, id, status, undefined)),
  );

  server.registerTool(
    'admin_adjust_user_points',
    {
      title: '调整用户解锁积分',
      description: '增减用户积分，必须填写原因；积分不得为负。',
      inputSchema: {
        userId: z.number().int().positive(),
        delta: z.number().int().min(-99999).max(99999).describe('正数增加，负数扣减'),
        reason: z.string().trim().min(1).max(64),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ userId, delta, reason }) =>
      jsonResult(await adjustAdminUserPoints(admin.id, userId, { delta, reason }, undefined)),
  );

  server.registerTool(
    'admin_grant_vip',
    {
      title: '赠送 30 天付费会员',
      description: '为指定用户赠送 30 天付费会员，会生成 pay_type=admin 的 0 元订单。',
      inputSchema: { userId: z.number().int().positive() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ userId }) => jsonResult(await grantAdminUserVip(admin.id, userId, undefined)),
  );

  server.registerTool(
    'admin_toggle_user_status',
    {
      title: '封禁 / 解封用户',
      description: '切换用户状态；封禁后该用户 JWT 立即失效。',
      inputSchema: { userId: z.number().int().positive() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ userId }) => jsonResult(await toggleAdminUserStatus(admin.id, userId, undefined)),
  );

  server.registerTool(
    'admin_update_site_config',
    {
      title: '更新站点配置',
      description:
        '按字段增量更新站点配置；未传字段保持原值。签到积分与水印开关会立即影响前台。',
      inputSchema: siteConfigInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      const bundle = await getAdminConfigBundle();
      const merged = {
        copyright: input.copyright ?? bundle.site.copyright,
        icpNo: input.icpNo ?? bundle.site.icpNo,
        ageStatement: input.ageStatement ?? bundle.site.ageStatement,
        disclaimer: input.disclaimer ?? bundle.site.disclaimer,
        checkinPoints: input.checkinPoints ?? bundle.site.checkinPoints,
        watermarkOn: input.watermarkOn ?? bundle.site.watermarkOn,
      };
      return jsonResult(await updateAdminSiteConfig(admin.id, merged, undefined));
    },
  );

  server.registerTool(
    'admin_update_plan',
    {
      title: '更新会员套餐',
      description: '更新月卡价格（分）、有效天数与权益文案。',
      inputSchema: {
        priceCents: z.number().int().min(1).max(1000000).describe('单位：分'),
        durationDays: z.number().int().min(1).max(365),
        benefits: z.array(z.string().trim().max(100)).min(1).max(12),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => jsonResult(await updateAdminPlan(admin.id, input, undefined)),
  );

  server.registerTool(
    'admin_create_tag',
    {
      title: '新建标签',
      description: '新建一个标签，重名会被拒绝。',
      inputSchema: { name: z.string().trim().min(1).max(20) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ name }) => jsonResult(await createAdminTag(admin.id, name, undefined)),
  );

  server.registerTool(
    'admin_toggle_tag',
    {
      title: '显示 / 隐藏标签',
      description: '切换标签前台展示状态。',
      inputSchema: idInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ id }) => jsonResult(await toggleAdminTag(admin.id, id, undefined)),
  );

  server.registerTool(
    'admin_toggle_author',
    {
      title: '显示 / 隐藏作者',
      description: '切换作者前台展示状态。',
      inputSchema: idInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ id }) => jsonResult(await toggleAdminAuthor(admin.id, id, undefined)),
  );

  server.registerTool(
    'admin_toggle_announcement',
    {
      title: '发布 / 下线公告',
      description: '切换公告的发布状态。',
      inputSchema: idInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ id }) => jsonResult(await toggleAdminAnnouncement(admin.id, id, undefined)),
  );
}
