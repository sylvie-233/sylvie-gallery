import type {
  AdminConfigBundle,
  AdminFriendLinkRow,
  AdminPlanConfig,
  AdminSiteConfig,
} from '@sylvie/types';

import { dbClient, type TransactionConnection } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { toBool, toNumber } from '../../utils/format.js';
import { logAdminOp } from './log.service.js';

interface ConfigRow {
  key: string;
  value: string | null;
}

async function getConfigRows(): Promise<Record<string, string>> {
  const rows = await dbClient.query<ConfigRow>(
    `SELECT config_key AS \`key\`, config_value AS value FROM sys_config`,
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value ?? '';
  }
  return map;
}

async function getPlan(): Promise<AdminPlanConfig> {
  const row = await dbClient.queryOne<{
    id: number;
    code: string;
    name: string;
    priceCents: number;
    durationDays: number;
    benefits: string | null;
    status: number;
  }>(
    `SELECT id, code, name, price_cents AS priceCents, duration_days AS durationDays,
            benefits, status
       FROM membership_plan
      WHERE code = 'monthly'
      LIMIT 1`,
  );
  if (!row) {
    throw new HttpError(500, '会员套餐未初始化');
  }
  let benefits: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.benefits ?? '[]');
    if (Array.isArray(parsed)) {
      benefits = parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    benefits = [];
  }
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    priceCents: Number(row.priceCents),
    durationDays: Number(row.durationDays),
    benefits,
    status: Number(row.status),
  };
}

async function getFriendLinks(): Promise<AdminFriendLinkRow[]> {
  const rows = await dbClient.query<{
    id: number;
    name: string;
    slogan: string | null;
    url: string;
    sortOrder: number;
  }>(
    `SELECT id, name, slogan, url, sort_order AS sortOrder
       FROM friend_link
      WHERE status = 1
      ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    slogan: row.slogan,
    url: row.url,
    sortOrder: Number(row.sortOrder),
  }));
}

export async function getAdminConfigBundle(): Promise<AdminConfigBundle> {
  const [config, plan, friendLinks] = await Promise.all([
    getConfigRows(),
    getPlan(),
    getFriendLinks(),
  ]);
  const site: AdminSiteConfig = {
    copyright: config['site.copyright'] ?? '',
    icpNo: config['site.icp_no'] ?? '',
    ageStatement: config['site.age_statement'] ?? '',
    disclaimer: config['site.disclaimer'] ?? '',
    checkinPoints: Number(config['checkin.points'] ?? 2),
    watermarkOn: config['image.watermark_on'] !== '0',
  };
  return { site, plan, friendLinks };
}

async function upsertConfig(
  conn: TransactionConnection,
  key: string,
  value: string,
  adminId: number,
): Promise<void> {
  await conn.query(
    `INSERT INTO sys_config (config_key, config_value, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by)`,
    [key, value, adminId],
  );
}

export async function updateAdminSiteConfig(
  adminId: number,
  input: {
    copyright: string;
    icpNo: string;
    ageStatement: string;
    disclaimer: string;
    checkinPoints: number;
    watermarkOn: boolean;
  },
  ip?: string | null,
): Promise<AdminConfigBundle> {
  const checkinPoints = Math.min(99, Math.max(1, Math.floor(input.checkinPoints)));
  await dbClient.transaction(async (conn) => {
    await upsertConfig(conn, 'site.copyright', input.copyright.trim(), adminId);
    await upsertConfig(conn, 'site.icp_no', input.icpNo.trim(), adminId);
    await upsertConfig(conn, 'site.age_statement', input.ageStatement.trim(), adminId);
    await upsertConfig(conn, 'site.disclaimer', input.disclaimer.trim(), adminId);
    await upsertConfig(conn, 'checkin.points', String(checkinPoints), adminId);
    await upsertConfig(conn, 'image.watermark_on', input.watermarkOn ? '1' : '0', adminId);
  });

  await logAdminOp(
    adminId,
    'config.update',
    'config',
    null,
    {
      copyright: input.copyright,
      icpNo: input.icpNo,
      checkinPoints,
      watermarkOn: input.watermarkOn,
    },
    ip,
  );
  return getAdminConfigBundle();
}

export async function updateAdminPlan(
  adminId: number,
  input: { priceCents: number; durationDays: number; benefits: string[] },
  ip?: string | null,
): Promise<AdminConfigBundle> {
  const priceCents = Math.max(1, Math.floor(input.priceCents));
  const durationDays = Math.min(365, Math.max(1, Math.floor(input.durationDays)));
  const benefits = input.benefits.map((item) => item.trim()).filter(Boolean);
  if (benefits.length === 0) {
    throw new HttpError(400, '请至少填写一条权益文案');
  }

  const plan = await getPlan();
  await dbClient.execute(
    `UPDATE membership_plan SET price_cents = ?, duration_days = ?, benefits = ?
      WHERE id = ?`,
    [priceCents, durationDays, JSON.stringify(benefits), plan.id],
  );
  await logAdminOp(
    adminId,
    'config.plan',
    'config',
    plan.id,
    { priceCents, durationDays, benefits },
    ip,
  );
  return getAdminConfigBundle();
}

function validateUrl(input: string): string {
  const url = input.trim();
  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
      throw new Error('invalid');
    }
    return url;
  } catch {
    throw new HttpError(400, '链接需以 http:// 或 https:// 开头且包含域名');
  }
}

export async function createAdminFriendLink(
  adminId: number,
  input: { name: string; slogan?: string; url: string },
  ip?: string | null,
): Promise<AdminFriendLinkRow> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 32) {
    throw new HttpError(400, '站名需为 1-32 个字符');
  }
  const slogan = input.slogan?.trim() || null;
  if (slogan && Array.from(slogan).length > 64) {
    throw new HttpError(400, '简介最多 64 个字符');
  }
  const url = validateUrl(input.url);
  const maxRow = await dbClient.queryOne<{ maxSort: number | null }>(
    `SELECT MAX(sort_order) AS maxSort FROM friend_link`,
  );
  const sortOrder = Number(maxRow?.maxSort ?? 0) + 1;
  const [result] = await dbClient.pool.query(
    `INSERT INTO friend_link (name, slogan, url, sort_order, status) VALUES (?, ?, ?, ?, 1)`,
    [name, slogan, url, sortOrder],
  );
  const id = (result as { insertId: number }).insertId;
  await logAdminOp(adminId, 'friend.create', 'friend_link', id, { name, slogan, url }, ip);
  return { id, name, slogan, url, sortOrder };
}

export async function deleteAdminFriendLink(
  adminId: number,
  id: number,
  ip?: string | null,
): Promise<void> {
  const row = await dbClient.queryOne<{ id: number; name: string; url: string }>(
    `SELECT id, name, url FROM friend_link WHERE id = ? AND status = 1 LIMIT 1`,
    [id],
  );
  if (!row) {
    throw new HttpError(404, '友链不存在');
  }
  await dbClient.execute(`UPDATE friend_link SET status = 0 WHERE id = ?`, [id]);
  await logAdminOp(adminId, 'friend.delete', 'friend_link', id, row, ip);
}

/** 供内部检查配置值。 */
export async function isWatermarkOn(): Promise<boolean> {
  const config = await getConfigRows();
  return toBool(config['image.watermark_on'] !== '0');
}

export async function getCheckinPoints(): Promise<number> {
  const config = await getConfigRows();
  return toNumber(config['checkin.points'], 2);
}
