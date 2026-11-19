import { createApiRouter } from '../openapi/router.js';
import adminAuthRoutes from './admin/auth.js';
import adminRoutes from './admin/index.js';
import albumRoutes from './albums.js';
import announcementRoutes from './announcements.js';
import authRoutes from './auth.js';
import authorRoutes from './authors.js';
import commentRoutes from './comments.js';
import feedRoutes from './feed.js';
import fileRoutes from './files.js';
import mcpRoutes from './mcp.js';
import meRoutes from './me.js';
import notificationRoutes from './notifications.js';
import orderRoutes from './orders.js';
import siteRoutes from './site.js';
import tagRoutes from './tags.js';

const router = createApiRouter();

router.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: '登录成功后签发的 JWT；后台接口使用管理后台登录签发的令牌。',
});

router.route('/admin/auth', adminAuthRoutes);
router.route('/admin', adminRoutes);
router.route('/auth', authRoutes);
router.route('/site', siteRoutes);
router.route('/albums', albumRoutes);
router.route('/authors', authorRoutes);
router.route('/feed', feedRoutes);
router.route('/tags', tagRoutes);
router.route('/announcements', announcementRoutes);
router.route('/orders', orderRoutes);
router.route('/me', meRoutes);
router.route('/notifications', notificationRoutes);
router.route('/comments', commentRoutes);
router.route('/files', fileRoutes);
router.route('/mcp', mcpRoutes);

router.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: '希尔薇图集 API',
    version: '1.0.0',
    description: [
      '希尔薇图集 v1 API（Hono + MySQL + RustFS）。',
      '',
      '统一响应：成功 `{ code: 200, message, data }`，失败 `{ code, message, data: null }`。',
      '分页统一为 `{ list, total, page, pageSize, totalPages }`。',
      '前台登录态通过 `Authorization: Bearer <token>` 传递；后台接口位于 `/api/admin/*`，需要管理员角色。',
    ].join('\n'),
  },
  servers: [{ url: '/api', description: '当前服务' }],
  tags: [
    { name: '认证', description: '验证码、注册、登录、个人资料、签到' },
    { name: '站点', description: '站点初始化数据与配置' },
    { name: '图集', description: '图集列表/详情、评论、收藏、解锁与下载' },
    { name: '作者', description: '作者列表/详情与订阅' },
    { name: '推荐流', description: '瀑布流「个人推荐」' },
    { name: '标签', description: '前台标签云' },
    { name: '公告', description: '前台公告列表' },
    { name: '订单', description: '会员套餐、开通/续费与我的购买' },
    { name: '个人中心', description: '我的收藏与已订阅作者' },
    { name: '通知', description: '我的通知与已读状态' },
    { name: '文件', description: '对象存储代理读取' },
    { name: 'MCP', description: '面向 agent 的 MCP Streamable HTTP 端点' },
    { name: '后台 · 认证', description: '管理后台独立登录' },
    { name: '后台 · 看板', description: '数据看板与趋势' },
    { name: '后台 · 图集', description: '图集发布、上下架、推荐与删除' },
    { name: '后台 · 标签', description: '标签新建、改名、隐藏与删除' },
    { name: '后台 · 作者', description: '作者新建、编辑、隐藏与删除' },
    { name: '后台 · 评论', description: '评论审核与删除' },
    { name: '后台 · 公告', description: '公告发布、编辑、上下线与删除' },
    { name: '后台 · 订单', description: '支付流水、退款与导出' },
    { name: '后台 · 用户', description: '用户列表、积分调整、赠送会员、重置密码与封禁' },
    { name: '后台 · 配置', description: '站点配置、会员套餐与友情链接' },
    { name: '后台 · 日志', description: '管理操作日志' },
    { name: '后台 · 令牌', description: 'Agent 访问令牌的创建、列表与吊销' },
    { name: '后台 · 上传', description: '图片 / 视频 / 头像上传' },
  ],
  security: [{ BearerAuth: [] }],
});

export default router;
