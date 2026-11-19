/**
 * 后台站点配置：系统配置键值、月度会员套餐、友情链接的读取与更新。
 *
 * 配置项以 sys_config 键值存储；站点配置更新在单事务内逐项 upsert。
 * 写操作均记录操作日志，并返回最新的完整配置包。
 */
import type {
  AdminConfigBundle,
  AdminFriendLinkRow,
  AdminPlanConfig,
  AdminSiteConfig,
} from '@sylvie/types';

import { dbClient, type TransactionConnection } from '../../db/index.js';
import { HttpError } from '../../utils/http.js';
import { toBool, toNumber } from '../../utils/format.js';
import {
  insertFriendLink,
  selectConfigRows,
  selectFriendLinkById,
  selectFriendLinks,
  selectMaxFriendLinkSort,
  selectMonthlyPlan,
  softDeleteFriendLink,
  updateMembershipPlan,
  upsertConfig,
  type ConfigRow,
  type PlanRow,
} from '../../sql/admin/config-admin.sql.js';
import { logAdminOp } from './log.service.js';

/** 读取全部 sys_config，组装为「键 → 值」映射；空值归一为空字符串。 */
async function getConfigRows(): Promise<Record<string, string>> {
  const statement = selectConfigRows();
  const rows = await dbClient.query<ConfigRow>(statement.sql, statement.params);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value ?? '';
  }
  return map;
}

/**
 * 读取 code = 'monthly' 的会员套餐。
 *
 * benefits 以 JSON 数组字符串存储，解析失败或非字符串项会被忽略并降级为空数组；
 * 套餐未初始化时抛 500。
 */
async function getPlan(): Promise<AdminPlanConfig> {
  const statement = selectMonthlyPlan();
  const row = await dbClient.queryOne<PlanRow>(statement.sql, statement.params);
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

/** 读取启用中的友情链接，按 sort_order 升序。 */
async function getFriendLinks(): Promise<AdminFriendLinkRow[]> {
  const statement = selectFriendLinks();
  const rows = await dbClient.query<{
    id: number;
    name: string;
    slogan: string | null;
    url: string;
    sortOrder: number;
  }>(statement.sql, statement.params);
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    slogan: row.slogan,
    url: row.url,
    sortOrder: Number(row.sortOrder),
  }));
}

/**
 * 读取后台配置包（站点文案、签到积分、水印开关、会员套餐、友链）。
 *
 * 三个数据源并发查询；签到积分缺省为 2，水印开关缺省为开启（仅值为 '0' 时关闭）。
 */
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

/** 在事务连接上按键 upsert 单个配置项，并记录最后修改人。 */
async function upsertConfigValue(
  conn: TransactionConnection,
  key: string,
  value: string,
  adminId: number,
): Promise<void> {
  const statement = upsertConfig(key, value, adminId);
  await conn.query(statement.sql, statement.params);
}

/**
 * 更新站点配置。
 *
 * 签到积分夹取到 1-99；六个配置项在同一事务内逐项 upsert，避免部分成功。
 * 事务提交后记录 config.update 日志（不记录完整正文，仅关键项），返回最新配置包。
 * 水印开关只控制未解锁预览是否使用水印图，不影响已解锁原图。
 */
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
    await upsertConfigValue(conn, 'site.copyright', input.copyright.trim(), adminId);
    await upsertConfigValue(conn, 'site.icp_no', input.icpNo.trim(), adminId);
    await upsertConfigValue(conn, 'site.age_statement', input.ageStatement.trim(), adminId);
    await upsertConfigValue(conn, 'site.disclaimer', input.disclaimer.trim(), adminId);
    await upsertConfigValue(conn, 'checkin.points', String(checkinPoints), adminId);
    await upsertConfigValue(conn, 'image.watermark_on', input.watermarkOn ? '1' : '0', adminId);
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

/**
 * 更新月度会员套餐的价格、时长与权益文案。
 *
 * 价格至少 1 分，时长夹取到 1-365 天；权益文案去空白后序列化为 JSON 存储，至少保留一条。
 * 成功后记录 config.plan 日志并返回最新配置包。
 */
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
  const statement = updateMembershipPlan(
    priceCents,
    durationDays,
    JSON.stringify(benefits),
    plan.id,
  );
  await dbClient.execute(statement.sql, statement.params);
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

/** 校验并返回友链地址：仅允许 http/https 且必须含主机名。 */
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

/**
 * 新增友情链接。
 *
 * 校验站名 1-32 字符、简介最多 64 字符、URL 合法；sort_order 取当前最大值 + 1 追加到末尾。
 * 新链接默认启用，记录 friend.create 日志。
 */
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
  const maxStatement = selectMaxFriendLinkSort();
  const maxRow = await dbClient.queryOne<{ maxSort: number | null }>(
    maxStatement.sql,
    maxStatement.params,
  );
  const sortOrder = Number(maxRow?.maxSort ?? 0) + 1;
  const insertStatement = insertFriendLink(name, slogan, url, sortOrder);
  const [result] = await dbClient.pool.query(insertStatement.sql, insertStatement.params);
  const id = (result as { insertId: number }).insertId;
  await logAdminOp(adminId, 'friend.create', 'friend_link', id, { name, slogan, url }, ip);
  return { id, name, slogan, url, sortOrder };
}

/**
 * 删除友情链接：将 status 置 0（软删除），记录 friend.delete 日志。
 * 列表只展示 status = 1 的链接，因此删除后不再出现。
 */
export async function deleteAdminFriendLink(
  adminId: number,
  id: number,
  ip?: string | null,
): Promise<void> {
  const identityStatement = selectFriendLinkById(id);
  const row = await dbClient.queryOne<{ id: number; name: string; url: string }>(
    identityStatement.sql,
    identityStatement.params,
  );
  if (!row) {
    throw new HttpError(404, '友链不存在');
  }
  const deleteStatement = softDeleteFriendLink(id);
  await dbClient.execute(deleteStatement.sql, deleteStatement.params);
  await logAdminOp(adminId, 'friend.delete', 'friend_link', id, row, ip);
}

/**
 * 供内部检查水印开关：仅当配置值为 '0' 时视为关闭，缺失或其他值都视为开启。
 * 注意这里服务于未解锁预览，不影响已解锁原图。
 */
export async function isWatermarkOn(): Promise<boolean> {
  const config = await getConfigRows();
  return toBool(config['image.watermark_on'] !== '0');
}

/** 读取每日签到奖励积分；未配置时默认 2 分。 */
export async function getCheckinPoints(): Promise<number> {
  const config = await getConfigRows();
  return toNumber(config['checkin.points'], 2);
}
