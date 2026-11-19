/**
 * 支付层公共类型定义。
 *
 * 约定：
 * - 金额在包内与对外一律使用「分」（整数），仅在与支付宝交互时转换为元；
 * - 服务商差异由 `PaymentProvider` 接口收敛，业务侧只消费统一状态；
 * - 退款失败会抛错，其余查询类接口以 `unknown` 表示无法确认。
 */

/**
 * 统一支付状态。
 * - `pending`：等待买家付款；
 * - `paid`：已支付（支付宝 `TRADE_SUCCESS` / `TRADE_FINISHED`）；
 * - `closed`：交易关闭（超时未付或已退款关闭）；
 * - `unknown`：查询失败或支付宝返回非成功码，调用方应按未确认处理。
 */
export type PaymentStatus = 'pending' | 'paid' | 'closed' | 'unknown';

/** 支持的服务商；接入微信支付时按 `PaymentProvider` 扩展。 */
export type PaymentProviderName = 'alipay';

/**
 * 支付宝配置。
 * 沙箱与生产共用同一套签名逻辑，仅 `gateway` 与密钥不同。
 * 密钥 PEM 由调用方自行准备与修复格式，本包不做格式转换。
 */
export interface AlipayOptions {
  /** 开放平台应用的 AppID。 */
  appId: string;
  /** 应用私钥（PKCS8 或 PKCS1 PEM，需由调用方保证格式正确）。 */
  privateKey: string;
  /** 支付宝公钥，用于验签异步通知与查询结果。 */
  alipayPublicKey: string;
  /** 网关；沙箱为 https://openapi-sandbox.dl.alipaydev.com/gateway.do。 */
  gateway?: string;
  /** 签名算法，默认 `RSA2`。 */
  signType?: 'RSA2' | 'RSA';
  /** 私钥格式，默认 `PKCS8`；需与实际 PEM 内容一致。 */
  keyType?: 'PKCS1' | 'PKCS8';
  /** 异步通知地址，必须公网可访问。 */
  notifyUrl: string;
  /** 同步跳转地址（支付完成后浏览器返回）。 */
  returnUrl?: string;
  /** 请求支付宝网关的超时时间（毫秒），默认 10 秒。 */
  timeoutMs?: number;
}

/** 创建电脑网站支付参数。 */
export interface CreatePagePaymentInput {
  /** 商户订单号（我们的 `order_no`），同一订单不得重复用于新支付。 */
  orderNo: string;
  /** 金额（分）。 */
  amountCents: number;
  subject: string;
  body?: string;
  /** 支付超时，默认 30 分钟。 */
  timeoutMinutes?: number;
}

/** 创建支付结果：`payUrl` 为支付宝收银台地址，前端直接跳转即可。 */
export interface CreatePaymentResult {
  provider: PaymentProviderName;
  payUrl: string;
}

/** 主动查询结果：用于支付回跳后的状态兜底，金额已从元转换为分。 */
export interface PaymentQueryResult {
  provider: PaymentProviderName;
  status: PaymentStatus;
  /** 支付宝交易流水号；未支付或无记录时为 null。 */
  tradeNo: string | null;
  /** 实付金额（分），未知时为 null。 */
  amountCents: number | null;
  /** 买家支付宝用户号，未知时为 null。 */
  buyerId: string | null;
}

/**
 * 退款参数。
 *
 * 支付宝要求 `trade_no` 与 `out_trade_no` 二选一：
 * 有交易流水号时优先使用，缺失时回退到商户订单号。
 * `outRequestNo` 为退款请求幂等号（不是支付宝流水号），
 * 同一幂等号重复请求只会产生一次退款。
 */
export interface RefundPaymentInput {
  /** 商户订单号（我们的 order_no），tradeNo 缺失时使用。 */
  orderNo: string;
  /** 支付宝交易流水号；优先使用，缺失时回退到 orderNo。 */
  tradeNo?: string;
  /** 退款金额（分）；当前业务只做全额退款。 */
  amountCents: number;
  reason?: string;
  /** 幂等号；默认使用 orderNo，重复请求会返回同一结果。 */
  outRequestNo?: string;
}

/** 退款结果；金额单位为分。 */
export interface RefundResult {
  provider: PaymentProviderName;
  /** 本次退款使用的幂等号（`out_request_no`），可用于对账。 */
  refundNo: string;
  /** 实际退款金额（分）；支付宝未返回时取请求金额。 */
  amountCents: number;
}

/** 解析后的异步通知（仅在验签通过后产生）。 */
export interface PaymentNotification {
  provider: PaymentProviderName;
  /** 商户订单号。 */
  orderNo: string;
  /** 支付宝交易流水号。 */
  tradeNo: string | null;
  /** 映射后的统一状态。 */
  status: PaymentStatus;
  /** 通知中的订单金额（分）。 */
  amountCents: number | null;
  /** 原始通知参数，便于排查与落库。 */
  raw: Record<string, string>;
}

/**
 * 支付服务商统一接口，后续接入微信支付时按此扩展。
 *
 * 调用约定：
 * - `createPagePayment` 同步返回收银台地址；
 * - `query` 查询异常时返回 `unknown` 而非抛错；
 * - `refund` 失败会抛错，调用方在成功前不得更新本地退款状态；
 * - `verifyNotify` / `parseNotify` 必须先验签再消费通知内容。
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** 生成收银台支付地址。 */
  createPagePayment(input: CreatePagePaymentInput): CreatePaymentResult;
  /** 主动查询订单状态。 */
  query(orderNo: string): Promise<PaymentQueryResult>;
  /** 发起退款；失败抛出异常，调用方不得继续本地退款。 */
  refund(input: RefundPaymentInput): Promise<RefundResult>;
  /** 校验异步通知签名。 */
  verifyNotify(params: Record<string, string>): boolean;
  /** 校验签名并解析通知。 */
  parseNotify(params: Record<string, string>): PaymentNotification | null;
}
