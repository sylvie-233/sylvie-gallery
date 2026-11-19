/**
 * 支付宝实现：电脑网站支付 `alipay.trade.page.pay`。
 *
 * 设计要点：
 * - 沙箱与生产共用同一套签名逻辑，仅切换 `gateway` 与密钥；
 * - 对外金额统一为「分」，仅在调用支付宝前后做元 / 分转换；
 * - 密钥 PEM 由调用方负责准备与格式修复，本包不做格式转换；
 * - 查询与异步通知的签名校验失败时不会抛出，而是返回 `unknown` / `null`。
 */
import { AlipaySdk } from 'alipay-sdk';

import type {
  AlipayOptions,
  CreatePagePaymentInput,
  CreatePaymentResult,
  PaymentNotification,
  PaymentProvider,
  PaymentQueryResult,
  PaymentStatus,
  RefundPaymentInput,
  RefundResult,
} from './types.js';

/**
 * 分转元：1900 → "19.00"。
 * 负数按 0 处理，避免把非法金额传给支付宝。
 */
function centsToYuan(cents: number): string {
  return (Math.max(0, Math.round(cents)) / 100).toFixed(2);
}

/**
 * 元转分："19.00" → 1900。
 * 空值与非法数字返回 null，由调用方按「金额未知」处理。
 */
function yuanToCents(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return null;
  }
  return Math.round(amount * 100);
}

/**
 * 支付宝交易状态映射为统一状态：
 * `TRADE_SUCCESS` / `TRADE_FINISHED` → `paid`，
 * `WAIT_BUYER_PAY` → `pending`，`TRADE_CLOSED` → `closed`，其余 → `unknown`。
 */
function mapTradeStatus(status: string | undefined): PaymentStatus {
  if (status === 'TRADE_SUCCESS' || status === 'TRADE_FINISHED') {
    return 'paid';
  }
  if (status === 'WAIT_BUYER_PAY') {
    return 'pending';
  }
  if (status === 'TRADE_CLOSED') {
    return 'closed';
  }
  return 'unknown';
}

/**
 * 支付宝网页支付（电脑网站支付 alipay.trade.page.pay）。
 * 沙箱与生产共用同一套签名逻辑，只切换 gateway 与密钥。
 */
export class AlipayProvider implements PaymentProvider {
  readonly name = 'alipay' as const;
  private readonly sdk: AlipaySdk;
  private readonly options: AlipayOptions;

  /**
   * @param options 应用 AppID、私钥、支付宝公钥及网关等配置。
   * @throws appId / privateKey / alipayPublicKey 任一缺失时抛错。
   */
  constructor(options: AlipayOptions) {
    if (!options.appId || !options.privateKey || !options.alipayPublicKey) {
      throw new Error('支付宝配置不完整：需要 appId、privateKey 与 alipayPublicKey');
    }
    this.options = options;
    this.sdk = new AlipaySdk({
      appId: options.appId,
      privateKey: options.privateKey,
      alipayPublicKey: options.alipayPublicKey,
      gateway: options.gateway,
      signType: options.signType ?? 'RSA2',
      keyType: options.keyType ?? 'PKCS8',
      timeout: options.timeoutMs ?? 10_000,
    });
  }

  /**
   * 生成支付宝收银台地址（GET 跳转）。
   * @param input 订单号、金额（分）、标题与支付超时时间（默认 30 分钟）。
   * @returns 前端可直接跳转的 URL。
   */
  createPagePayment(input: CreatePagePaymentInput): CreatePaymentResult {
    const payUrl = this.sdk.pageExec('alipay.trade.page.pay', {
      method: 'GET',
      bizContent: {
        out_trade_no: input.orderNo,
        product_code: 'FAST_INSTANT_TRADE_PAY',
        total_amount: centsToYuan(input.amountCents),
        subject: input.subject,
        ...(input.body ? { body: input.body } : {}),
        timeout_express: `${input.timeoutMinutes ?? 30}m`,
      },
      returnUrl: this.options.returnUrl,
      notifyUrl: this.options.notifyUrl,
    });

    return { provider: 'alipay', payUrl };
  }

  /**
   * 主动查询交易；用于支付回跳后的状态兜底。
   * 支付宝返回非成功码或网络异常时返回 `status: 'unknown'`，不抛错。
   * @param orderNo 商户订单号。
   */
  async query(orderNo: string): Promise<PaymentQueryResult> {
    try {
      const result = await this.sdk.exec('alipay.trade.query', {
        bizContent: { out_trade_no: orderNo },
      });
      if (result.code !== '10000') {
        return {
          provider: 'alipay',
          status: 'unknown',
          tradeNo: null,
          amountCents: null,
          buyerId: null,
        };
      }
      return {
        provider: 'alipay',
        status: mapTradeStatus(result.tradeStatus as string | undefined),
        tradeNo: (result.tradeNo as string | undefined) ?? null,
        amountCents: yuanToCents(result.totalAmount as string | undefined),
        buyerId: (result.buyerUserId as string | undefined) ?? null,
      };
    } catch {
      return {
        provider: 'alipay',
        status: 'unknown',
        tradeNo: null,
        amountCents: null,
        buyerId: null,
      };
    }
  }

  /**
   * 发起退款（alipay.trade.refund）。
   *
   * 支付宝要求 `out_trade_no`（商户订单号）与 `trade_no`（支付宝流水号）二选一：
   * 有流水号时优先使用流水号，否则使用商户订单号。
   *
   * `out_request_no` 是退款请求幂等号（非支付宝流水号），默认与订单号一致：
   * 同一退款请求重复调用时支付宝返回同一结果，不会重复退款。
   */
  async refund(input: RefundPaymentInput): Promise<RefundResult> {
    const outRequestNo = input.outRequestNo ?? input.orderNo;
    let result: Awaited<ReturnType<AlipaySdk['exec']>>;
    try {
      result = await this.sdk.exec('alipay.trade.refund', {
        bizContent: {
          ...(input.tradeNo
            ? { trade_no: input.tradeNo }
            : { out_trade_no: input.orderNo }),
          refund_amount: centsToYuan(input.amountCents),
          out_request_no: outRequestNo,
          ...(input.reason ? { refund_reason: input.reason } : {}),
        },
      });
    } catch (error) {
      throw new Error(
        `支付宝退款请求失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (result.code !== '10000') {
      throw new Error(
        `支付宝退款失败：${(result.subMsg as string | undefined) ?? result.msg ?? result.code}`,
      );
    }

    return {
      provider: 'alipay',
      refundNo: outRequestNo,
      amountCents: yuanToCents(result.refundFee as string | undefined) ?? input.amountCents,
    };
  }

  /**
   * 校验异步通知签名，并确认通知属于当前应用。
   *
   * 先做两项快速校验：`sign` 必须存在、`app_id`（如有）必须与本应用一致，
   * 再交给 SDK 验签；任何异常都视为验签失败并返回 `false`。
   */
  verifyNotify(params: Record<string, string>): boolean {
    if (!params.sign) {
      return false;
    }
    if (params.app_id && params.app_id !== this.options.appId) {
      return false;
    }
    try {
      return this.sdk.checkNotifySign(params);
    } catch {
      return false;
    }
  }

  /**
   * 校验并解析异步通知；签名无效或 `app_id` 不匹配返回 null。
   * 注意：本方法只负责验签与字段解析，金额校验与幂等履约由调用方负责。
   */
  parseNotify(params: Record<string, string>): PaymentNotification | null {
    if (!this.verifyNotify(params)) {
      return null;
    }
    return {
      provider: 'alipay',
      orderNo: params.out_trade_no ?? '',
      tradeNo: params.trade_no ?? null,
      status: mapTradeStatus(params.trade_status),
      amountCents: yuanToCents(params.total_amount),
      raw: params,
    };
  }
}

/**
 * 创建支付宝支付实例的快捷函数。
 * @param options 同 `AlipayProvider` 构造参数。
 */
export function createAlipayProvider(options: AlipayOptions): AlipayProvider {
  return new AlipayProvider(options);
}
