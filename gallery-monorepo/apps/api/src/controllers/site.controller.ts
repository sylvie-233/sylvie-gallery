import { getConfigMap, getSiteBootstrap } from '../services/site.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import { currentUser } from './helpers.js';

/** GET /api/site/bootstrap */
export async function bootstrap(c: AppContext): Promise<Response> {
  return success(c, await getSiteBootstrap(currentUser(c)?.id));
}

/** GET /api/site/config */
export async function config(c: AppContext): Promise<Response> {
  return success(c, await getConfigMap());
}
