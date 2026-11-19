/**
 * 前台作者控制器：列表 / 详情与订阅切换。
 * 列表与详情只为游客缓存（登录用户要携带订阅状态），订阅操作需登录。
 */
import { cacheKey, cached } from '../cache/index.js';
import {
  getAuthorDetail,
  listAuthors,
  listSubscribedAuthors,
  toggleSubscription,
} from '../services/author.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import type {
  AuthorDetailInput,
  AuthorListInput,
  PageQueryInput,
} from '../validators/albums.js';
import { currentUser, requireUser } from './helpers.js';

/**
 * GET /api/authors —— 作者列表。
 *
 * @param query 路由校验后的 authorListSchema（仅 keyword）
 * 游客列表缓存 1 分钟（含订阅状态，故登录用户不缓存）；关键词作为缓存键的一部分。
 */
export async function list(c: AppContext, query: AuthorListInput) {
  const user = currentUser(c);
  const loader = () => listAuthors(query.keyword, user?.id);

  if (user) {
    return success(c, await loader());
  }
  return success(
    c,
    await cached(cacheKey('authors', 'list', query.keyword ?? 'all'), 60, loader),
  );
}

/**
 * GET /api/authors/:id —— 作者详情与其图集分页。
 *
 * @param id 路径参数；query 为 authorDetailSchema（分页，pageSize ≤36）
 * 同样只为游客缓存 1 分钟，缓存键包含分页参数。
 */
export async function detail(
  c: AppContext,
  id: number,
  query: AuthorDetailInput,
) {
  const user = currentUser(c);
  const loader = () => getAuthorDetail(id, user?.id, query.page, query.pageSize);

  if (user) {
    return success(c, await loader());
  }
  const key = cacheKey('authors', 'detail', id, query.page ?? 1, query.pageSize ?? 12);
  return success(c, await cached(key, 60, loader));
}

/**
 * POST /api/authors/:id/subscribe —— 切换作者订阅。
 *
 * @param id 路径参数
 * 副作用：新增 / 删除 author_subscription 记录；响应 subscribed 为切换后的状态。
 */
export async function subscribe(c: AppContext, id: number) {
  const result = await toggleSubscription(id, requireUser(c).id);
  return success(c, result, result.subscribed ? '已订阅该作者' : '已取消订阅');
}

/**
 * GET /api/me/subscriptions —— 我订阅的作者分页。
 *
 * @param query 路由校验后的 pageQuerySchema
 * 只返回当前登录用户订阅的作者，按订阅时间倒序。
 */
export async function subscriptions(c: AppContext, query: PageQueryInput) {
  return success(c, await listSubscribedAuthors(requireUser(c).id, query.page, query.pageSize));
}
