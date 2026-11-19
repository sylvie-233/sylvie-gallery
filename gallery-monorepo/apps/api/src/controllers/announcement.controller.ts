/**
 * 前台公告控制器：公告分页列表，无关键词时做短时缓存。
 */
import { cacheKey, cached } from '../cache/index.js';
import { listAnnouncements } from '../services/announcement.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import type { AnnouncementListInput } from '../validators/misc.js';
import { currentUser } from './helpers.js';

/**
 * GET /api/announcements —— 公告分页列表。
 *
 * @param query 路由校验后的 announcementListSchema（分页、关键词）
 * 只缓存无关键词的常规分页（60 秒），搜索结果实时查询；
 * 缓存键故意不含 userId，公告内容本身与用户无关。
 */
export async function list(c: AppContext, query: AnnouncementListInput) {
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
