import { Readable } from 'node:stream';

import {
  createAlbumZip,
  createComment,
  deleteComment,
  getAlbumDetail,
  getFeed,
  listAlbums,
  listFavoriteAlbums,
  toggleFavorite,
} from '../services/album.service.js';
import { unlockAlbum } from '../services/order.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import type {
  AlbumListInput,
  CommentInput,
  FeedQueryInput,
  PageQueryInput,
} from '../validators/albums.js';
import { clientIp, currentUser, requireUser } from './helpers.js';

/** GET /api/albums */
export async function list(c: AppContext, query: AlbumListInput): Promise<Response> {
  return success(c, await listAlbums(query, currentUser(c)?.id));
}

/** GET /api/albums/:id */
export async function detail(c: AppContext, id: number): Promise<Response> {
  return success(c, await getAlbumDetail(id, currentUser(c), clientIp(c)));
}

/** GET /api/feed */
export async function feed(c: AppContext, query: FeedQueryInput): Promise<Response> {
  return success(c, await getFeed(query.page, query.pageSize, currentUser(c)?.id));
}

/** POST /api/albums/:id/comments */
export async function comment(c: AppContext, id: number, input: CommentInput): Promise<Response> {
  const result = await createComment(id, requireUser(c).id, input);
  return success(c, result, '评论已提交，审核通过后展示', 201);
}

/** POST /api/albums/:id/favorite */
export async function favorite(c: AppContext, id: number): Promise<Response> {
  const result = await toggleFavorite(id, requireUser(c).id);
  return success(c, result, result.favorited ? '已收藏' : '已取消收藏');
}

/** POST /api/albums/:id/unlock */
export async function unlock(c: AppContext, id: number): Promise<Response> {
  const result = await unlockAlbum(requireUser(c).id, id);
  return success(c, result, result.already ? '当前已可查看全部内容' : '解锁成功');
}

/** GET /api/albums/:id/download */
export async function download(c: AppContext, id: number): Promise<Response> {
  const user = requireUser(c);
  const { stream, filename } = await createAlbumZip(id, user);
  const encoded = encodeURIComponent(filename);
  return c.body(Readable.toWeb(stream) as never, 200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="album.zip"; filename*=UTF-8''${encoded}`,
    'Cache-Control': 'no-store',
  });
}

/** DELETE /api/comments/:id */
export async function removeComment(c: AppContext, id: number): Promise<Response> {
  await deleteComment(id, requireUser(c).id);
  return success(c, null, '评论已删除');
}

/** GET /api/me/favorites */
export async function favorites(c: AppContext, query: PageQueryInput): Promise<Response> {
  return success(c, await listFavoriteAlbums(requireUser(c).id, query.page, query.pageSize));
}
