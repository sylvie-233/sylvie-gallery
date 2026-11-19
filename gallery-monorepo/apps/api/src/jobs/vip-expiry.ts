/**
 * 付费会员到期处理：
 * 定时扫描已到期账号并批量降级为 member；到期延时任务在写通知前再次校验，
 * 防止用户续费后旧任务误发。SQL 均来自 `sql/job.sql.ts` 的参数化语句。
 */
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
 * 将已到期的付费会员批量降级为注册会员。
 *
 * 权限判断本身是「读时惰性降级」，这里负责把 `user.role` 落库修正，
 * 让后台用户列表 / 筛选与看板口径一致。保留 `vip_expire_at` 便于展示与审计。
 *
 * 在一个事务内先用 `FOR UPDATE` 锁定到期行，再批量更新为 member，
 * 避免并发扫描或续费时相互覆盖。没有任何到期用户时不写库。
 *
 * @returns 本次降级的用户数量。
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

/**
 * 读取会员到期时间。
 * @param userId 用户 ID。
 * @returns 北京时间 DATETIME 字符串；用户不存在或未设置到期时间时为 null。
 */
export async function getVipExpireAt(userId: number): Promise<string | null> {
  const statement = selectVipExpireAt(userId);
  const row = await dbClient.queryOne<{ vipExpireAt: string | null }>(
    statement.sql,
    statement.params,
  );
  return row?.vipExpireAt ?? null;
}

/**
 * 发送会员到期通知：向 `user_notification` 写入一条权益变更站内信。
 *
 * 执行前再次确认用户仍处于到期状态（续费后残留的旧延时任务不会误发）。
 * 副作用：仅写站内通知，不做邮件 / 短信等外部推送。
 *
 * @returns 实际是否写入通知；用户未到期、已删除或为管理员时返回 false。
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
