/**
 * 管理后台路由总入口：把 /api/admin 下各业务子路由挂载到统一前缀。
 * 所有子路由共享 authenticate + requireAdmin，仅管理员可访问。
 */
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { createApiRouter } from '../../openapi/router.js';
import agentTokenRoutes from './agent-tokens.js';
import albumRoutes from './albums.js';
import announcementRoutes from './announcements.js';
import authorRoutes from './authors.js';
import commentRoutes from './comments.js';
import configRoutes from './config.js';
import dashboardRoutes from './dashboard.js';
import logRoutes from './logs.js';
import orderRoutes from './orders.js';
import tagRoutes from './tags.js';
import uploadRoutes from './upload.js';
import userRoutes from './users.js';

const router = createApiRouter();

// 全量后台路由统一鉴权：先解析 JWT，再校验角色必须是 admin。
router.use('*', authenticate, requireAdmin);

router.route('/dashboard', dashboardRoutes);
router.route('/albums', albumRoutes);
router.route('/tags', tagRoutes);
router.route('/authors', authorRoutes);
router.route('/comments', commentRoutes);
router.route('/announcements', announcementRoutes);
router.route('/orders', orderRoutes);
router.route('/users', userRoutes);
router.route('/config', configRoutes);
router.route('/logs', logRoutes);
router.route('/upload', uploadRoutes);
router.route('/agent-tokens', agentTokenRoutes);

export default router;
