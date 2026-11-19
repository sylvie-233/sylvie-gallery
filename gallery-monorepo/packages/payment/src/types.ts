/** 统一支付状态。 */
export type PaymentStatus = 'pending' | 'paid' | 'closed' | 'unknown';

/** 支持的服务商。 */
export type PaymentProviderName = 'alipay';

/** 支付宝配置；沙箱与生产仅 `gateway` 不同。 */
export interface AlipayOptions {
  appId: string;
  /** 应用私钥（PKCS8 或 PKCS1）。 */
  privateKey: string;
  /** 支付宝公钥，用于验签异步通知与查询结果。 */
  alipayPublicKey: string;
  /** 网关；沙箱为 https://openapi-sandbox.dl.alipaydev.com/gateway.do。 */
  gateway?: string;
  signType?: 'RSA2' | 'RSA';
  keyType?: 'PKCS1' | 'PKCS8';
  /** 异步通知地址，必须公网可访问。 */
  notifyUrl: string;
  /** 同步跳转地址（支付完成后浏览器返回）。 */
  returnUrl?: string;
  timeoutMs?: number;
}

/** 创建网页支付参数。 */
export interface CreatePagePaymentInput {
  orderNo: string;
  /** 金额（分）。 */
  amountCents: number;
  subject: string;
  body?: string;
  /** 支付超时，默认 30 分钟。 */
  timeoutMinutes?: number;
}

/** 创建支付结果：payUrl 为支付宝收银台地址。 */
export interface CreatePaymentResult {
  provider: PaymentProviderName;
  payUrl: string;
}

/** 主动查询结果。 */
export interface PaymentQueryResult {
  provider: PaymentProviderName;
  status: PaymentStatus;
  tradeNo: string | null;
  /** 实付金额（分），未知时为 null。 */
  amountCents: number | null;
  buyerId: string | null;
}

/** 解析后的异步通知。 */
export interface PaymentNotification {
  provider: PaymentProviderName;
  orderNo: string;
  tradeNo: string | null;
  status: PaymentStatus;
  amountCents: number | null;
  raw: Record<string, string>;
}

/** 支付服务商统一接口，后续接入微信支付时按此扩展。 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** 生成收银台支付地址。 */
  createPagePayment(input: CreatePagePaymentInput): CreatePaymentResult;
  /** 主动查询订单状态。 */
  query(orderNo: string): Promise<PaymentQueryResult>;
  /** 校验异步通知签名。 */
  verifyNotify(params: Record<string, string>): boolean;
  /** 校验签名并解析通知。 */
  parseNotify(params: Record<string, string>): PaymentNotification | null;
}
