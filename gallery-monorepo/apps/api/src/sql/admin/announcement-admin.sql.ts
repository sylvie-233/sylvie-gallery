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

/** 公告列表筛选条件。 */
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

export function countAdminAnnouncements(where: SqlFragment): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM announcement WHERE ${where.sql}`,
    params: where.params,
  };
}

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

export function selectAdminAnnouncementById(id: number): SqlStatement {
  return {
    sql: `SELECT ${ANNOUNCEMENT_SELECT} FROM announcement
      WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [id],
  };
}

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

export function selectAnnouncementIdentity(id: number): SqlStatement {
  return {
    sql: `SELECT id, title FROM announcement WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [id],
  };
}

export function updateAnnouncement(id: number, data: AnnouncementWriteData): SqlStatement {
  return {
    sql: `UPDATE announcement SET type = ?, title = ?, summary = ?, content = ?, is_top = ?
      WHERE id = ?`,
    params: [data.type, data.title, data.summary, data.content, data.isTop, id],
  };
}

export function selectAnnouncementStatus(id: number): SqlStatement {
  return {
    sql: `SELECT id, title, status FROM announcement WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    params: [id],
  };
}

export function toggleAnnouncement(next: number, id: number): SqlStatement {
  return {
    sql: `UPDATE announcement SET status = ?, published_at = IF(?, NOW(), published_at) WHERE id = ?`,
    params: [next, next, id],
  };
}

export function softDeleteAnnouncement(id: number): SqlStatement {
  return {
    sql: `UPDATE announcement SET is_deleted = 1, status = 0 WHERE id = ?`,
    params: [id],
  };
}
