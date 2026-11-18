import { Readable } from 'node:stream';

import { Hono } from 'hono';
import { z } from 'zod';

import { authenticate, optionalAuth } from '../middleware/auth.js';
import {
  createAlbumZip,
  createComment,
  getAlbumDetail,
  listAlbums,
  toggleFavorite,
} from '../services/album.service.js';
import { unlockAlbum } from '../services/order.service.js';
import type { AppEnv } from '../types/context.js';
import { HttpError, success } from '../utils/http.js';
import { parseId, parseJson, parseQuery } from '../utils/validate.js';

const router = new Hono<AppEnv>();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(48).optional(),
  sort: z.enum(['new', 'hot', 'fav']).optional(),
  tag: z.string().trim().max(32).optional(),
  keyword: z.string().trim().max(64).optional(),
  authorId: z.coerce.number().int().positive().optional(),
});

router.get('/', optionalAuth, async (c) => {
  const query = parseQuery(c, listSchema);
  const user = c.get('currentUser');
  return success(c, await listAlbums(query, user?.id));
});

function clientIp(header: string | undefined): string | undefined {
  return header?.split(',')[0]?.trim();
}

router.get('/:id', optionalAuth, async (c) => {
  const id = parseId(c.req.param('id'), '图集 ID');
  const user = c.get('currentUser');
  const ip = clientIp(c.req.header('x-forwarded-for')) ?? c.req.header('x-real-ip');
  return success(c, await getAlbumDetail(id, user, ip));
});

const commentSchema = z.object({
  content: z.string().trim().min(1, '评论内容不能为空').max(500, '评论最多 500 个字符'),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  replyToUserId: z.coerce.number().int().positive().nullable().optional(),
});

router.post('/:id/comments', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const id = parseId(c.req.param('id'), '图集 ID');
  const input = await parseJson(c, commentSchema);
  const comment = await createComment(id, user.id, input);
  return success(c, comment, '评论已提交，审核通过后展示', 201);
});

router.post('/:id/favorite', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const id = parseId(c.req.param('id'), '图集 ID');
  const result = await toggleFavorite(id, user.id);
  return success(c, result, result.favorited ? '已收藏' : '已取消收藏');
});

router.post('/:id/unlock', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const id = parseId(c.req.param('id'), '图集 ID');
  const result = await unlockAlbum(user.id, id);
  return success(c, result, result.already ? '当前已可查看全部内容' : '解锁成功');
});

router.get('/:id/download', authenticate, async (c) => {
  const user = c.get('currentUser');
  if (!user) {
    throw new HttpError(401, '未登录或登录已过期');
  }
  const id = parseId(c.req.param('id'), '图集 ID');
  const { stream, filename } = await createAlbumZip(id, user);
  const encoded = encodeURIComponent(filename);
  return c.body(Readable.toWeb(stream) as never, 200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="album.zip"; filename*=UTF-8''${encoded}`,
    'Cache-Control': 'no-store',
  });
});

export default router;
