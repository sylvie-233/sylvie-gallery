import { Hono } from 'hono';

import type { AppEnv } from '../types/context.js';
import albumRoutes from './albums.js';
import announcementRoutes from './announcements.js';
import authRoutes from './auth.js';
import authorRoutes from './authors.js';
import commentRoutes from './comments.js';
import feedRoutes from './feed.js';
import fileRoutes from './files.js';
import meRoutes from './me.js';
import notificationRoutes from './notifications.js';
import orderRoutes from './orders.js';
import siteRoutes from './site.js';
import tagRoutes from './tags.js';

const router = new Hono<AppEnv>();

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

export default router;
