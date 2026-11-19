import { listTags } from '../services/tag.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';

/** GET /api/tags */
export async function list(c: AppContext): Promise<Response> {
  return success(c, await listTags());
}
