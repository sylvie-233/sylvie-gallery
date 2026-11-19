import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { createApiRouter } from '../../openapi/router.js';
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

export default router;
