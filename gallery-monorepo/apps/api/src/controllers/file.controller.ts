import { getObject } from '../services/storage.service.js';
import type { AppContext } from '../types/context.js';
import { failure } from '../utils/http.js';

const ALLOWED_PREFIXES = ['avatars/', 'albums/', 'authors/'];

/** GET /api/files/:key —— 对象存储代理，便于签名与防盗链。 */
export async function proxy(c: AppContext): Promise<Response> {
  const key = c.req.param('key');
  if (!key || !ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix)) || key.includes('..')) {
    return failure(c, 404, '文件不存在');
  }

  const object = await getObject(key);
  if (!object) {
    return failure(c, 404, '文件不存在');
  }

  const headers: Record<string, string> = {
    'Content-Type': object.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  if (object.contentLength !== undefined) {
    headers['Content-Length'] = String(object.contentLength);
  }

  return c.body(object.body as never, 200, headers);
}
