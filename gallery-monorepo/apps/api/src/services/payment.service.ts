/**
 * 支付宝支付服务封装：
 * - 真实 / 模拟支付由 `ALIPAY_MOCK` 切换，所有金额单位统一为分；
 * - 启动时自动识别私钥 / 公钥 PEM 格式并构建 provider；
 * - 对外提供收银台地址、异步通知验签解析、主动查询与真实退款。
 */
import { createPrivateKey, createPublicKey } from 'node:crypto';

import {
  createAlipayProvider,
  type CreatePagePaymentInput,
  type PaymentNotification,
  type PaymentQueryResult,
  type RefundPaymentInput,
  type RefundResult,
} from '@sylvie/payment';

import { env } from '../config/env.js';
import { moduleLogger } from '../utils/logger.js';

const log = moduleLogger('payment');

/** 归一化后的私钥及其实际解析出的格式，用于向 SDK 传递正确的 keyType。 */
interface NormalizedPrivateKey {
  key: string;
  keyType: 'PKCS1' | 'PKCS8';
}

/**
 * 去掉 PEM 头尾与空白，得到 Base64 主体；同时兼容 `.env` 中以 `\n` / `\\n` 转义换行的写法。
 * @returns 不含 PEM 头尾与换行的 Base64 字符串。
 */
function pemBody(value: string): string {
  return value
    .replace(/\\+n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
}

/**
 * 私钥归一化：支付宝开放平台导出的私钥可能是 PKCS#1 或 PKCS#8，
 * 头部与内容偶尔不一致。这里依次尝试原始内容、PKCS#8、PKCS#1，
 * 并用 OpenSSL（Node crypto）实际解析成功的结果为准。
 *
 * @param value `.env` 中的私钥原文，允许 `\n` 转义。
 * @returns 可直接交给 SDK 的 PEM 与真实格式（PKCS1 / PKCS8）。
 * @throws 私钥为空或三种候选格式都无法解析时抛错。
 */
function normalizePrivateKey(value: string): NormalizedPrivateKey {
  const normalized = value.replace(/\\+n/g, '\n').trim();
  const body = pemBody(value);
  if (!body) {
    throw new Error('支付宝私钥为空');
  }

  // 回退顺序：原样 → PKCS#8（PRIVATE KEY）→ PKCS#1（RSA PRIVATE KEY）。
  const candidates = [
    normalized,
    `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`,
    `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`,
  ];
  for (const candidate of candidates) {
    try {
      createPrivateKey(candidate);
      return {
        key: candidate,
        keyType: candidate.includes('RSA PRIVATE KEY') ? 'PKCS1' : 'PKCS8',
      };
    } catch {
      // 尝试下一种格式。
    }
  }
  throw new Error('支付宝私钥格式无效（支持 PKCS#1 / PKCS#8 PEM）');
}

/**
 * 公钥归一化：兼容 SPKI（PUBLIC KEY）与 PKCS#1（RSA PUBLIC KEY）。
 * @param value `.env` 中的支付宝公钥原文，允许 `\n` 转义。
 * @returns 可交给 SDK 的 PEM。
 * @throws 公钥为空或两种格式都无法解析时抛错。
 */
function normalizePublicKey(value: string): string {
  const normalized = value.replace(/\\+n/g, '\n').trim();
  const body = pemBody(value);
  if (!body) {
    throw new Error('支付宝公钥为空');
  }

  // 回退顺序：原样 → SPKI（PUBLIC KEY）→ PKCS#1（RSA PUBLIC KEY）。
  const candidates = [
    normalized,
    `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`,
    `-----BEGIN RSA PUBLIC KEY-----\n${body}\n-----END RSA PUBLIC KEY-----`,
  ];
  for (const candidate of candidates) {
    try {
      createPublicKey(candidate);
      return candidate;
    } catch {
      // 尝试下一种格式。
    }
  }
  throw new Error('支付宝公钥格式无效');
}

/**
 * 真实支付宝支付是否可用：关闭 mock（`ALIPAY_MOCK=false`）且
 * APP_ID、应用私钥、支付宝公钥三要素齐全。
 * 为 false 时走本地模拟支付分支，不请求支付宝网关。
 */
export const realPaymentEnabled =
  !env.ALIPAY_MOCK &&
  Boolean(env.ALIPAY_APP_ID && env.ALIPAY_PRIVATE_KEY && env.ALIPAY_PUBLIC_KEY);

/**
 * 真实支付 provider 单例；模拟支付或配置不完整时为 null。
 * 构建时会完成密钥归一化，签名类型与网关由环境变量决定（沙箱 / 生产仅切换 gateway）。
 */
const provider = realPaymentEnabled
  ? (() => {
      const privateKey = normalizePrivateKey(env.ALIPAY_PRIVATE_KEY);
      return createAlipayProvider({
        appId: env.ALIPAY_APP_ID,
        privateKey: privateKey.key,
        alipayPublicKey: normalizePublicKey(env.ALIPAY_PUBLIC_KEY),
        gateway: env.ALIPAY_GATEWAY,
        signType: env.ALIPAY_SIGN_TYPE,
        // 以实际解析成功的格式为准，避免 `.env` 中 KEY_TYPE 与实际内容不一致。
        keyType: privateKey.keyType,
        notifyUrl: env.ALIPAY_NOTIFY_URL,
        returnUrl: env.ALIPAY_RETURN_URL,
      });
    })()
  : null;

if (!env.ALIPAY_MOCK && !provider) {
  log.warn('ALIPAY_MOCK=false 但支付宝配置不完整，真实支付不可用', {
    hasAppId: Boolean(env.ALIPAY_APP_ID),
    hasPrivateKey: Boolean(env.ALIPAY_PRIVATE_KEY),
    hasPublicKey: Boolean(env.ALIPAY_PUBLIC_KEY),
  });
}

/**
 * 生成支付宝收银台地址（电脑网站支付，GET 跳转）。
 * @param input 订单号、金额（分）、商品标题等；金额在 provider 内由分转换为元。
 * @returns 可直接跳转的支付宝 URL。
 * @throws 模拟支付或配置不完整（provider 为 null）时抛错，调用方应走模拟支付分支。
 */
export function createAlipayPagePayment(input: CreatePagePaymentInput): string {
  if (!provider) {
    throw new Error('支付宝支付未配置：请设置 ALIPAY_MOCK=false 并提供应用密钥');
  }
  return provider.createPagePayment(input).payUrl;
}

/**
 * 验签并解析异步通知：校验签名与 app_id，并解析订单号、流水号、
 * 交易状态与实付金额（分，元转分）。
 * @returns 解析结果；签名无效、非本应用通知或模拟支付模式下返回 null。
 */
export function parseAlipayNotify(
  params: Record<string, string>,
): PaymentNotification | null {
  if (!provider) {
    return null;
  }
  return provider.parseNotify(params);
}

/**
 * 主动查询支付宝交易状态，用于支付回跳后的兜底确认。
 * @param orderNo 商户订单号。
 * @returns 统一状态与实付金额（分）；模拟支付模式下返回 null，查询异常时状态为 unknown。
 */
export async function queryAlipayPayment(orderNo: string): Promise<PaymentQueryResult | null> {
  if (!provider) {
    return null;
  }
  return provider.query(orderNo);
}

/**
 * 发起支付宝退款（全额退款，金额单位为分）。
 * 仅真实支付模式可用；模拟支付与管理员赠送订单不调用支付宝。
 * 优先使用支付宝交易流水号，缺失时回退到商户订单号；
 * `out_request_no` 作为幂等号，重复请求返回同一结果。
 *
 * @throws provider 未配置或支付宝返回失败时抛错；调用方必须保持本地订单状态不变，
 *         待确认成功后再更新退款状态。
 */
export async function refundAlipayPayment(input: RefundPaymentInput): Promise<RefundResult> {
  if (!provider) {
    throw new Error('支付宝支付未配置，无法发起真实退款');
  }
  return provider.refund(input);
}

/**
 * 支付通道状态（健康检查与文档展示用）。
 * @returns `mock`（模拟支付）、`alipay`（真实支付宝）或 `unconfigured`
 *          （关闭 mock 但配置不完整，真实支付不可用）。
 */
export function paymentMode(): 'mock' | 'alipay' | 'unconfigured' {
  if (env.ALIPAY_MOCK) {
    return 'mock';
  }
  return provider ? 'alipay' : 'unconfigured';
}
