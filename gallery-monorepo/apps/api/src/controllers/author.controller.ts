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

/** GET /api/authors：游客列表缓存 1 分钟（含订阅状态，故登录用户不缓存）。 */
export async function list(c: AppContext, query: AuthorListInput): Promise<Response> {
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

/** GET /api/authors/:id：同样只为游客缓存。 */
export async function detail(
  c: AppContext,
  id: number,
  query: AuthorDetailInput,
): Promise<Response> {
  const user = currentUser(c);
  const loader = () => getAuthorDetail(id, user?.id, query.page, query.pageSize);

  if (user) {
    return success(c, await loader());
  }
  const key = cacheKey('authors', 'detail', id, query.page ?? 1, query.pageSize ?? 12);
  return success(c, await cached(key, 60, loader));
}

/** POST /api/authors/:id/subscribe */
export async function subscribe(c: AppContext, id: number): Promise<Response> {
  const result = await toggleSubscription(id, requireUser(c).id);
  return success(c, result, result.subscribed ? '已订阅该作者' : '已取消订阅');
}

/** GET /api/me/subscriptions */
export async function subscriptions(c: AppContext, query: PageQueryInput): Promise<Response> {
  return success(c, await listSubscribedAuthors(requireUser(c).id, query.page, query.pageSize));
}
