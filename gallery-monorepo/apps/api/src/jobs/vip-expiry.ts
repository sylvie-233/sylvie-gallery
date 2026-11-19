import { dbClient, queryOn } from '../db/index.js';
import {
  downgradeVipUsers,
  insertVipExpiredNotification,
  selectExpiredVipUsers,
  selectVipExpireAt,
  selectVipExpiredForNotice,
  type ExpiredVipRow,
} from '../sql/job.sql.js';

/**
 * 将已到期的付费会员降级为注册会员。
 *
 * 权限判断本身是「读时惰性降级」，这里负责把 `user.role` 落库修正，
 * 让后台用户列表 / 筛选与看板口径一致。保留 `vip_expire_at` 便于展示与审计。
 */
export async function expireVipMemberships(): Promise<number> {
  return dbClient.transaction(async (conn) => {
    const select = selectExpiredVipUsers();
    const rows = await queryOn<ExpiredVipRow>(conn, select.sql, select.params);
    if (rows.length === 0) {
      return 0;
    }

    const ids = rows.map((row) => Number(row.id));
    const update = downgradeVipUsers(ids);
    await conn.query(update.sql, update.params);
    return ids.length;
  });
}

/** 读取会员到期时间。 */
export async function getVipExpireAt(userId: number): Promise<string | null> {
  const statement = selectVipExpireAt(userId);
  const row = await dbClient.queryOne<{ vipExpireAt: string | null }>(
    statement.sql,
    statement.params,
  );
  return row?.vipExpireAt ?? null;
}

/**
 * 发送会员到期通知。
 * 执行前再次确认已到期，续费后残留的旧任务不会误发。
 */
export async function notifyVipExpired(userId: number): Promise<boolean> {
  const check = selectVipExpiredForNotice(userId);
  const row = await dbClient.queryOne<{ id: number }>(check.sql, check.params);
  if (!row) {
    return false;
  }

  const insert = insertVipExpiredNotification(userId);
  await dbClient.execute(insert.sql, insert.params);
  return true;
}
