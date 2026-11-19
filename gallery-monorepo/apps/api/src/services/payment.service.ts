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

interface NormalizedPrivateKey {
  key: string;
  keyType: 'PKCS1' | 'PKCS8';
}

/** 去掉 PEM 头尾与空白，得到 Base64 主体；同时兼容 `\n` 转义。 */
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
 * 并用 OpenSSL 实际解析成功的结果为准。
 */
function normalizePrivateKey(value: string): NormalizedPrivateKey {
  const normalized = value.replace(/\\+n/g, '\n').trim();
  const body = pemBody(value);
  if (!body) {
    throw new Error('支付宝私钥为空');
  }

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

/** 公钥归一化：兼容 SPKI（PUBLIC KEY）与 PKCS#1（RSA PUBLIC KEY）。 */
function normalizePublicKey(value: string): string {
  const normalized = value.replace(/\\+n/g, '\n').trim();
  const body = pemBody(value);
  if (!body) {
    throw new Error('支付宝公钥为空');
  }

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

/** 真实支付宝支付是否可用：关闭 mock 且三要素齐全。 */
export const realPaymentEnabled =
  !env.ALIPAY_MOCK &&
  Boolean(env.ALIPAY_APP_ID && env.ALIPAY_PRIVATE_KEY && env.ALIPAY_PUBLIC_KEY);

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

/** 生成支付宝收银台地址。 */
export function createAlipayPagePayment(input: CreatePagePaymentInput): string {
  if (!provider) {
    throw new Error('支付宝支付未配置：请设置 ALIPAY_MOCK=false 并提供应用密钥');
  }
  return provider.createPagePayment(input).payUrl;
}

/** 验签并解析异步通知；无效返回 null。 */
export function parseAlipayNotify(
  params: Record<string, string>,
): PaymentNotification | null {
  if (!provider) {
    return null;
  }
  return provider.parseNotify(params);
}

/** 主动查询支付宝交易状态。 */
export async function queryAlipayPayment(orderNo: string): Promise<PaymentQueryResult | null> {
  if (!provider) {
    return null;
  }
  return provider.query(orderNo);
}

/**
 * 发起支付宝退款。
 * 仅真实支付模式可用；模拟支付与管理员赠送订单不调用支付宝。
 * 失败会抛错，调用方必须保持本地订单状态不变。
 */
export async function refundAlipayPayment(input: RefundPaymentInput): Promise<RefundResult> {
  if (!provider) {
    throw new Error('支付宝支付未配置，无法发起真实退款');
  }
  return provider.refund(input);
}

/** 支付通道状态（健康检查与文档展示用）。 */
export function paymentMode(): 'mock' | 'alipay' | 'unconfigured' {
  if (env.ALIPAY_MOCK) {
    return 'mock';
  }
  return provider ? 'alipay' : 'unconfigured';
}
