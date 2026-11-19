import { cacheKey, cached } from '../cache/index.js';
import { getConfigMap, getSiteBootstrap } from '../services/site.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import { currentUser } from './helpers.js';

/** GET /api/site/bootstrap：首页聚合数据，按访客 / 用户短缓存。 */
export async function bootstrap(c: AppContext): Promise<Response> {
  const userId = currentUser(c)?.id;
  const data = await cached(
    cacheKey('site', 'bootstrap', userId ?? 'guest'),
    30,
    () => getSiteBootstrap(userId),
  );
  return success(c, data);
}

/** GET /api/site/config：站点配置变化很少，缓存 5 分钟。 */
export async function config(c: AppContext): Promise<Response> {
  return success(c, await cached(cacheKey('site', 'config'), 300, getConfigMap));
}
