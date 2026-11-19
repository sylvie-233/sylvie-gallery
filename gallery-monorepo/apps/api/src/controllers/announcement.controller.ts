import { cacheKey, cached } from '../cache/index.js';
import { listAnnouncements } from '../services/announcement.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import type { AnnouncementListInput } from '../validators/misc.js';
import { currentUser } from './helpers.js';

/** GET /api/announcements：只缓存无关键词的常规分页，搜索结果实时查询。 */
export async function list(c: AppContext, query: AnnouncementListInput): Promise<Response> {
  const userId = currentUser(c)?.id;
  const loader = () => listAnnouncements(query, userId);

  if (query.keyword) {
    return success(c, await loader());
  }

  const data = await cached(
    cacheKey('announcements', 'list', query.page ?? 1, query.pageSize ?? 8),
    60,
    loader,
  );
  return success(c, data);
}
