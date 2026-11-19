import { listAnnouncements } from '../services/announcement.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import type { AnnouncementListInput } from '../validators/misc.js';
import { currentUser } from './helpers.js';

/** GET /api/announcements */
export async function list(c: AppContext, query: AnnouncementListInput): Promise<Response> {
  return success(c, await listAnnouncements(query, currentUser(c)?.id));
}
