/**
 * 前台标签控制器：标签云列表，只读并做短时缓存。
 */
import { cacheKey, cached } from '../cache/index.js';
import { listTags } from '../services/tag.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';

/** GET /api/tags —— 标签云：按收录套数排序，结果 2 分钟内复用。 */
export async function list(c: AppContext) {
  return success(c, await cached(cacheKey('tags', 'list'), 120, listTags));
}
