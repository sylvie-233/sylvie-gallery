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

/** GET /api/authors */
export async function list(c: AppContext, query: AuthorListInput): Promise<Response> {
  return success(c, await listAuthors(query.keyword, currentUser(c)?.id));
}

/** GET /api/authors/:id */
export async function detail(
  c: AppContext,
  id: number,
  query: AuthorDetailInput,
): Promise<Response> {
  return success(
    c,
    await getAuthorDetail(id, currentUser(c)?.id, query.page, query.pageSize),
  );
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
