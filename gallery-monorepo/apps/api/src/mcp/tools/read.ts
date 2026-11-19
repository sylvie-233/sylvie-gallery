/**
 * MCP 只读工具集：前台与后台的列表 / 详情 / 看板查询。
 * 所有工具都要求已完成 MCP 鉴权（管理员 JWT 或 Agent 令牌的 read / write scope），
 * 除 `get_album` 会记录浏览外不修改业务数据。
 */
import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getAuthorDetail, listAuthors } from '../../services/author.service.js';
import { getAlbumDetail, listAlbums } from '../../services/album.service.js';
import { listAnnouncements } from '../../services/announcement.service.js';
import {
  getAdminAlbumDetail,
  getAdminAlbums,
} from '../../services/admin/album-admin.service.js';
import { getAdminAnnouncements } from '../../services/admin/announcement-admin.service.js';
import { getAdminAuthors } from '../../services/admin/author-admin.service.js';
import { getAdminComments } from '../../services/admin/comment-admin.service.js';
import { getAdminConfigBundle } from '../../services/admin/config-admin.service.js';
import { getAdminDashboard, getAdminTrend } from '../../services/admin/dashboard.service.js';
import { getAdminLogs } from '../../services/admin/log-admin.service.js';
import { getAdminOrders } from '../../services/admin/order-admin.service.js';
import { getAdminTags } from '../../services/admin/tag-admin.service.js';
import { getAdminUsers } from '../../services/admin/user-admin.service.js';
import { listTags } from '../../services/tag.service.js';
import type { AuthUser } from '../../types/context.js';
import { authorDetailSchema, authorListSchema } from '../../validators/albums.js';
import { albumListSchema as publicAlbumListSchema } from '../../validators/albums.js';
import { announcementListSchema as publicAnnouncementListSchema } from '../../validators/misc.js';
import { albumListSchema as adminAlbumListSchema } from '../../validators/admin/catalog.js';
import {
  authorListSchema as adminAuthorListSchema,
  tagListSchema as adminTagListSchema,
} from '../../validators/admin/catalog.js';
import {
  announcementListSchema as adminAnnouncementListSchema,
  commentListSchema as adminCommentListSchema,
} from '../../validators/admin/content.js';
import {
  orderListSchema as adminOrderListSchema,
  userListSchema as adminUserListSchema,
} from '../../validators/admin/commerce.js';
import { logListSchema, trendSchema } from '../../validators/admin/system.js';
import { jsonResult } from '../result.js';

const idInput = { id: z.number().int().positive().describe('ID') };

/**
 * 注册只读工具：查询图集、作者、标签、公告与后台数据。
 *
 * 权限要求：管理员 JWT 或具备 read / write scope 的 Agent 令牌。
 * 写操作影响：除 `get_album` 会以当前管理员身份记录浏览（浏览量 +1）外，
 * 其余工具均不写库、不产生管理操作日志。
 */
export function registerReadTools(server: McpServer, admin: AuthUser): void {
  // 读工具（read scope）：前台图集分页列表，不修改数据。
  server.registerTool(
    'list_albums',
    {
      title: '查询图集列表',
      description:
        '前台图集列表，支持最新/热门/收藏排序、标签筛选、关键词搜索与作者筛选。返回分页结构。',
      inputSchema: publicAlbumListSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => jsonResult(await listAlbums(input, admin.id)),
  );

  // 读工具（read scope）：图集详情；副作用是记录一次浏览，可能使浏览量 +1。
  server.registerTool(
    'get_album',
    {
      title: '查询图集详情',
      description:
        '获取图集详情、媒体、评论与解锁状态。注意：该工具会为当前管理员记录一次浏览/浏览量。',
      inputSchema: idInput,
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ id }) => jsonResult(await getAlbumDetail(id, admin)),
  );

  // 读工具（read scope）：作者列表，不修改数据。
  server.registerTool(
    'list_authors',
    {
      title: '查询作者列表',
      description: '作者列表，支持姓名、别名与风格标签搜索。',
      inputSchema: authorListSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => jsonResult(await listAuthors(input.keyword, admin.id)),
  );

  // 读工具（read scope）：作者详情与其图集分页，不修改数据。
  server.registerTool(
    'get_author',
    {
      title: '查询作者详情',
      description: '作者详情、简介与其图集分页。',
      inputSchema: { ...idInput, ...authorDetailSchema.shape },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, page, pageSize }) =>
      jsonResult(await getAuthorDetail(id, admin.id, page, pageSize)),
  );

  // 读工具（read scope）：前台标签云，不修改数据。
  server.registerTool(
    'list_tags',
    {
      title: '查询标签云',
      description: '前台标签列表，按收录套数排序。',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => jsonResult(await listTags()),
  );

  // 读工具（read scope）：前台公告列表，不修改数据。
  server.registerTool(
    'list_announcements',
    {
      title: '查询公告列表',
      description: '前台公告列表，置顶优先，支持关键词搜索。',
      inputSchema: publicAnnouncementListSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => jsonResult(await listAnnouncements(input, admin.id)),
  );

  // 读工具（read scope）：后台看板聚合数据，不修改数据。
  server.registerTool(
    'admin_dashboard',
    {
      title: '查询后台看板',
      description: '今日营收、订单、用户、图集、评论待办与热搜词。',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => jsonResult(await getAdminDashboard()),
  );

  // 读工具（read scope）：营收趋势查询，不修改数据。
  server.registerTool(
    'admin_trend',
    {
      title: '查询营收趋势',
      description: '按 7 天 / 30 天 / 6 个月查询营收趋势。',
      inputSchema: trendSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ mode }) => jsonResult(await getAdminTrend(mode)),
  );

  // 读工具（read scope）：后台图集列表（含草稿 / 下架），不修改数据。
  server.registerTool(
    'admin_list_albums',
    {
      title: '后台查询图集',
      description: '按状态、关键词分页查询图集（含草稿与下架）。',
      inputSchema: adminAlbumListSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => jsonResult(await getAdminAlbums(input)),
  );

  // 读工具（read scope）：后台图集详情，不修改数据。
  server.registerTool(
    'admin_get_album',
    {
      title: '后台查询图集详情',
      description: '获取图集全部媒体、标签与发布状态。',
      inputSchema: idInput,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => jsonResult(await getAdminAlbumDetail(id)),
  );

  // 读工具（read scope）：后台标签列表，不修改数据。
  server.registerTool(
    'admin_list_tags',
    {
      title: '后台查询标签',
      description: '按状态与关键词分页查询标签。',
      inputSchema: adminTagListSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => jsonResult(await getAdminTags(input)),
  );

  // 读工具（read scope）：后台作者列表，不修改数据。
  server.registerTool(
    'admin_list_authors',
    {
      title: '后台查询作者',
      description: '按状态与关键词分页查询作者。',
      inputSchema: adminAuthorListSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => jsonResult(await getAdminAuthors(input)),
  );

  // 读工具（read scope）：后台评论列表，不修改数据。
  server.registerTool(
    'admin_list_comments',
    {
      title: '后台查询评论',
      description: '按审核状态、关键词与日期范围分页查询评论。',
      inputSchema: adminCommentListSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => jsonResult(await getAdminComments(input)),
  );

  // 读工具（read scope）：后台公告列表，不修改数据。
  server.registerTool(
    'admin_list_announcements',
    {
      title: '后台查询公告',
      description: '按类型、状态、关键词与日期范围分页查询公告。',
      inputSchema: adminAnnouncementListSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => jsonResult(await getAdminAnnouncements(input)),
  );

  // 读工具（read scope）：后台订单 / 支付流水，不修改数据。
  server.registerTool(
    'admin_list_orders',
    {
      title: '后台查询订单',
      description: '支付流水分页与汇总，支持业务、状态、关键词与日期筛选。',
      inputSchema: adminOrderListSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => jsonResult(await getAdminOrders(input)),
  );

  // 读工具（read scope）：后台用户列表，不修改数据。
  server.registerTool(
    'admin_list_users',
    {
      title: '后台查询用户',
      description: '用户分页列表，支持角色、状态与关键词筛选。',
      inputSchema: adminUserListSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => jsonResult(await getAdminUsers(input)),
  );

  // 读工具（read scope）：站点配置、会员套餐与友情链接聚合，不修改数据。
  server.registerTool(
    'admin_get_config',
    {
      title: '后台查询配置',
      description: '站点配置、会员套餐与友情链接聚合。',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => jsonResult(await getAdminConfigBundle()),
  );

  // 读工具（read scope）：后台管理操作日志，不修改数据。
  server.registerTool(
    'admin_list_logs',
    {
      title: '后台查询操作日志',
      description: '管理操作日志分页，支持动作、关键词与日期筛选。',
      inputSchema: logListSchema.shape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => jsonResult(await getAdminLogs(input)),
  );
}
