/**
 * 后台公告的参数化 SQL：筛选列表、详情读取、新增、编辑、上下架切换与软删除。
 *
 * 未使用物理删除；列表与详情均过滤 is_deleted = 0。
 */
import type { AnnouncementType } from '@sylvie/types';

import type { SqlFragment, SqlStatement } from '../shared.js';

/** 管理后台公告列表行。 */
export interface AnnouncementRow {
  id: number;
  type: AnnouncementType;
  title: string;
  summary: string | null;
  content: string | null;
  isTop: number;
  status: number;
  publishedAt: string;
  createdAt: string;
}

/** 公告列表筛选参数：类型、状态、关键字与发布时间区间。 */
export interface AnnouncementFilter {
  type?: string;
  status?: string;
  keyword?: string;
  from?: string;
  to?: string;
}

/** 校验后的公告写入字段。 */
export interface AnnouncementWriteData {
  type: AnnouncementType;
  title: string;
  summary: string | null;
  content: string | null;
  isTop: number;
}

const ANNOUNCEMENT_SELECT = `id, type, title, summary, content, is_top AS isTop,
  status, published_at AS publishedAt, created_at AS createdAt`;

/**
 * 构建公告列表 WHERE 片段。
 *
 * - 固定条件：is_deleted = 0；
 * - type 存在且不为 all 时精确匹配类型；
 * - status 仅接受 '1' / '0'，转换为数字精确匹配；
 * - keyword 去空白后在标题、摘要、正文中 LIKE 匹配；
 * - from / to 以 DATE(published_at) 做闭区间过滤。
 */
export function buildAnnouncementWhere(filter: AnnouncementFilter): SqlFragment {
  const conditions = ['is_deleted = 0'];
  const params: unknown[] = [];

  if (filter.type && filter.type !== 'all') {
    conditions.push('type = ?');
    params.push(filter.type);
  }
  if (filter.status === '1' || filter.status === '0') {
    conditions.push('status = ?');
    params.push(Number(filter.status));
  }
  const keyword = filter.keyword?.trim() ?? '';
  if (keyword) {
    const like = `%${keyword}%`;
    conditions.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
    params.push(like, like, like);
  }
  if (filter.from) {
    conditions.push('DATE(published_at) >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push('DATE(published_at) <= ?');
    params.push(filter.to);
  }

  return { sql: conditions.join(' AND '), params };
}

/** 统计当前筛选条件下的公告总数。 */
export function countAdminAnnouncements(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM announcement WHERE ${where.sql}`,
    params: where.params,
  };
}

/**
 * 公告分页列表：置顶优先 → 发布时间倒序 → id 倒序；limit / offset 由调用方计算。
 */
export function selectAdminAnnouncements(
  where: SqlFragment,
  limit: number,
  offset: number,
): SqlStatement {
  return {
    sql: `SELECT ${ANNOUNCEMENT_SELECT}
       FROM announcement
      WHERE ${where.sql}
      ORDER BY is_top DESC, published_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    params: [...where.params, limit, offset],
  };
}

/** 读取未软删除的公告详情。 */
export function selectAdminAnnouncementById(id: number): SqlStatement {
  return {
    sql: `SELECT ${ANNOUNCEMENT_SELECT} FROM announcement
      WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [id],
  };
}

/** 新增公告：直接以展示状态（status 1）发布，published_at 取当前时间，记录创建人。 */
export function insertAnnouncement(
  data: AnnouncementWriteData,
  adminId: number,
): SqlStatement {
  return {
    sql: `INSERT INTO announcement (type, title, summary, content, is_top, status, published_at, created_by)
     VALUES (?, ?, ?, ?, ?, 1, NOW(), ?)`,
    params: [data.type, data.title, data.summary, data.content, data.isTop, adminId],
  };
}

/** 编辑 / 删除前读取公告身份（id + 标题），不存在或已删除时查不到。 */
export function selectAnnouncementIdentity(id: number): SqlStatement {
  return {
    sql: `SELECT id, title FROM announcement WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [id],
  };
}

/** 更新公告可编辑字段；不改动 status 与 published_at。 */
export function updateAnnouncement(id: number, data: AnnouncementWriteData): SqlStatement {
  return {
    sql: `UPDATE announcement SET type = ?, title = ?, summary = ?, content = ?, is_top = ?
      WHERE id = ?`,
    params: [data.type, data.title, data.summary, data.content, data.isTop, id],
  };
}

/** 上下架切换前读取当前状态。 */
export function selectAnnouncementStatus(id: number): SqlStatement {
  return {
    sql: `SELECT id, title, status FROM announcement WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [id],
  };
}

/**
 * 切换展示状态：next 同时作为 status 值与 IF 条件；
 * 重新展示（next = 1）时刷新 published_at，隐藏时保留原发布时间。
 */
export function toggleAnnouncement(next: number, id: number): SqlStatement {
  return {
    sql: `UPDATE announcement SET status = ?, published_at = IF(?, NOW(), published_at) WHERE id = ?`,
    params: [next, next, id],
  };
}

/** 软删除公告：置 is_deleted = 1 且 status = 0，保留记录。 */
export function softDeleteAnnouncement(id: number): SqlStatement {
  return {
    sql: `UPDATE announcement SET is_deleted = 1, status = 0 WHERE id = ?`,
    params: [id],
  };
}
