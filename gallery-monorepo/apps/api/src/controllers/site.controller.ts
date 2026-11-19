/**
 * 站点控制器：前台初始化聚合数据与站点配置，均做服务端短时缓存。
 */
import { cacheKey, cached } from '../cache/index.js';
import { getConfigMap, getSiteBootstrap } from '../services/site.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import { currentUser } from './helpers.js';

/**
 * GET /api/site/bootstrap —— 首页聚合数据。
 *
 * 缓存 30 秒；缓存键按访客 / 用户区分，登录用户能看到自己的作者订阅状态，避免串号。
 */
export async function bootstrap(c: AppContext) {
  const userId = currentUser(c)?.id;
  const data = await cached(
    cacheKey('site', 'bootstrap', userId ?? 'guest'),
    30,
    () => getSiteBootstrap(userId),
  );
  return success(c, data);
}

/** GET /api/site/config —— 站点配置键值对：变化很少，缓存 5 分钟。 */
export async function config(c: AppContext) {
  return success(c, await cached(cacheKey('site', 'config'), 300, getConfigMap));
}
