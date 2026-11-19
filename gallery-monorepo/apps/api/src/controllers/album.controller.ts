/**
 * 前台图集控制器：列表 / 详情 / 推荐流、评论增删、收藏、解锁与打包下载。
 * 参数统一来自路由层的 `c.req.valid(...)`，本层只做缓存判断、身份提取与响应包装。
 */
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
import { cacheKey, cached } from '../cache/index.js';
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

/**
 * GET /api/albums —— 图集分页列表。
 *
 * @param query 路由校验后的 albumListSchema（分页、排序、标签、关键词、作者）
 * 仅缓存游客的常规列表：登录用户带收藏状态，搜索词长尾且实时性要求高。
 * 缓存键包含分页与筛选条件，TTL 30 秒。
 */
export async function list(c: AppContext, query: AlbumListInput): Promise<Response> {
  const user = currentUser(c);
  const loader = () => listAlbums(query, user?.id);

  if (user || query.keyword) {
    return success(c, await loader());
  }

  const key = cacheKey(
    'albums',
    'list',
    query.page ?? 1,
    query.pageSize ?? 24,
    query.sort ?? 'new',
    query.tag ?? 'all',
    query.authorId ?? 'all',
  );
  return success(c, await cached(key, 30, loader));
}

/**
 * GET /api/albums/:id —— 图集详情。
 *
 * @param id 路径参数，来自 `c.req.valid('param').id`
 * 副作用：服务层会累加 view_count（PV 统计），并按用户角色裁剪媒体列表
 * （未解锁前 3 张水印预览，已解锁 / 付费会员返回原图）。
 */
export async function detail(c: AppContext, id: number): Promise<Response> {
  return success(c, await getAlbumDetail(id, currentUser(c), clientIp(c)));
}

/**
 * GET /api/feed —— 瀑布流「个人推荐」。
 *
 * @param query 路由校验后的 feedQuerySchema（page 默认 1，pageSize 默认 24）
 * 登录用户按偏好排序，游客按推荐池 + 最新内容；不写缓存，避免偏好变化后读到旧结果。
 */
export async function feed(c: AppContext, query: FeedQueryInput): Promise<Response> {
  return success(c, await getFeed(query.page, query.pageSize, currentUser(c)?.id));
}

/**
 * POST /api/albums/:id/comments —— 发表评论。
 *
 * @param id 路径参数；input 为 commentSchema 校验后的请求体（正文、父评论、回复对象）
 * 副作用：写入待审核评论并累加 album.comment_count；固定返回 201 与审核提示文案。
 */
export async function comment(c: AppContext, id: number, input: CommentInput): Promise<Response> {
  const result = await createComment(id, requireUser(c).id, input);
  return success(c, result, '评论已提交，审核通过后展示', 201);
}

/**
 * POST /api/albums/:id/favorite —— 切换收藏状态。
 *
 * @param id 路径参数
 * 副作用：新增 / 软删除收藏记录，并同步维护 album.fav_count；
 * 响应中的 favorited 表示切换后的状态，提示文案随之变化。
 */
export async function favorite(c: AppContext, id: number): Promise<Response> {
  const result = await toggleFavorite(id, requireUser(c).id);
  return success(c, result, result.favorited ? '已收藏' : '已取消收藏');
}

/**
 * POST /api/albums/:id/unlock —— 消耗解锁积分永久解锁图集。
 *
 * @param id 路径参数
 * 副作用：事务内扣减 user.points（不得为负）并写入解锁记录；
 * 已解锁或付费会员直接返回 already=true，不重复扣分。
 */
export async function unlock(c: AppContext, id: number): Promise<Response> {
  const result = await unlockAlbum(requireUser(c).id, id);
  return success(c, result, result.already ? '当前已可查看全部内容' : '解锁成功');
}

/**
 * GET /api/albums/:id/download —— 打包下载原图 ZIP。
 *
 * @param id 路径参数
 * 服务层校验解锁 / 会员权限并生成流式 ZIP；下载不扣积分。
 * 响应使用 RFC 5987 的 filename* 传中文文件名，并禁止缓存。
 */
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

/**
 * DELETE /api/comments/:id —— 删除本人评论。
 *
 * @param id 评论 ID（路径参数）
 * 副作用：软删除评论（status=deleted）并同步扣减 album.comment_count；
 * 非本人评论由服务层抛出 403。
 */
export async function removeComment(c: AppContext, id: number): Promise<Response> {
  await deleteComment(id, requireUser(c).id);
  return success(c, null, '评论已删除');
}

/**
 * GET /api/me/favorites —— 我的收藏图集分页。
 *
 * @param query 路由校验后的 pageQuerySchema（pageSize ≤36）
 * 只读取当前登录用户的数据，按收藏时间倒序返回卡片。
 */
export async function favorites(c: AppContext, query: PageQueryInput): Promise<Response> {
  return success(c, await listFavoriteAlbums(requireUser(c).id, query.page, query.pageSize));
}
