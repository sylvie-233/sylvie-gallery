/**
 * 支付门面（Payment）与创建工厂。
 *
 * 门面只依赖 `PaymentProvider` 接口，按 `createPayment` 的 `provider` 选择具体实现；
 * 业务侧统一使用门面，切换 / 新增服务商不需要改动调用方式。
 * 协议细节（签名、验签、字段映射、元 / 分转换）由各服务商实现负责，本文件不做业务处理。
 */
import { AlipayProvider } from './alipay.js';
import type {
  CreatePagePaymentInput,
  CreatePaymentResult,
  PaymentNotification,
  PaymentOptions,
  PaymentProvider,
  PaymentProviderName,
  PaymentQueryResult,
  RefundPaymentInput,
  RefundResult,
} from './types.js';

/**
 * 统一支付门面。
 *
 * - 方法语义与 `PaymentProvider` 完全一致，只是把服务商差异收敛到构造参数；
 * - `provider` 为当前服务商实现，需要服务商专有 API（如微信支付的企业付款）时可直接访问；
 * - 创建实例一般由 `createPayment(options)` 完成。
 */
export class Payment implements PaymentProvider {
  /** 当前服务商名称。 */
  readonly name: PaymentProviderName;
  /** 底层服务商实现。 */
  readonly provider: PaymentProvider;

  constructor(provider: PaymentProvider) {
    this.provider = provider;
    this.name = provider.name;
  }

  /** 生成收银台支付地址（如支付宝电脑网站支付），前端直接跳转即可。 */
  createPagePayment(input: CreatePagePaymentInput): CreatePaymentResult {
    return this.provider.createPagePayment(input);
  }

  /** 主动查询订单状态；异常由服务商实现按 `unknown` 处理，不抛错。 */
  query(orderNo: string): Promise<PaymentQueryResult> {
    return this.provider.query(orderNo);
  }

  /** 发起退款；失败抛错，调用方在成功前不得更新本地退款状态。 */
  refund(input: RefundPaymentInput): Promise<RefundResult> {
    return this.provider.refund(input);
  }

  /** 校验异步通知签名。 */
  verifyNotify(params: Record<string, string>): boolean {
    return this.provider.verifyNotify(params);
  }

  /** 校验签名并解析异步通知；无效通知返回 null。 */
  parseNotify(params: Record<string, string>): PaymentNotification | null {
    return this.provider.parseNotify(params);
  }
}

/**
 * 按配置创建支付门面。
 *
 * `provider` 缺省为 `alipay`（当前唯一实现）；对应服务商配置缺失时立即抛错。
 * 新增服务商时在 `switch` 中注册实现，业务侧仍调用同一套门面方法。
 */
export function createPayment(options: PaymentOptions): Payment {
  const name = options.provider ?? 'alipay';

  switch (name) {
    case 'alipay': {
      if (!options.alipay) {
        throw new Error('Payment: provider=alipay 时 alipay 配置不能为空');
      }
      return new Payment(new AlipayProvider(options.alipay));
    }
    default:
      throw new Error(`Payment: 不支持的支付服务商：${String(name)}`);
  }
}
