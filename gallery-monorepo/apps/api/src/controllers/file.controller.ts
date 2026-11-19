/**
 * 文件代理控制器：把对象存储的读取收敛到 API，便于后续加签名与防盗链。
 * 只允许读取头像、图集、作者三个业务前缀下的对象。
 */
import { getObject } from '../services/storage.service.js';
import type { AppContext } from '../types/context.js';
import { failure } from '../utils/http.js';

const ALLOWED_PREFIXES = ['avatars/', 'albums/', 'authors/'];

/**
 * GET /api/files/:key —— 对象存储代理读取。
 *
 * key 来自通配路径（可含多级 `/`）；拒绝前缀不在白名单或包含 `..` 的路径，
 * 防止目录穿越访问桶内其他对象。对象内容不可变，因此可长期强缓存。
 */
export async function proxy(c: AppContext): Promise<Response> {
  const key = c.req.param('key');
  if (!key || !ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix)) || key.includes('..')) {
    return failure(c, 404, '文件不存在');
  }

  const object = await getObject(key);
  if (!object) {
    return failure(c, 404, '文件不存在');
  }

  // 对象键带时间戳 / UUID，内容不会原地覆盖，可使用一年期 immutable 缓存。
  const headers: Record<string, string> = {
    'Content-Type': object.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  if (object.contentLength !== undefined) {
    headers['Content-Length'] = String(object.contentLength);
  }

  return c.body(object.body as never, 200, headers);
}
