/**
 * `@sylvie/payment` 包入口：导出公共类型、统一门面与支付宝实现。
 *
 * 业务侧推荐用 `createPayment({ provider, alipay })` 创建门面；
 * 接入其他服务商时实现 `PaymentProvider` 接口并在 `createPayment` 中注册，
 * 需要直连支付宝时仍可使用 `createAlipayProvider`。
 */
export * from './types.js';
export { Payment, createPayment } from './payment.js';
export { AlipayProvider, createAlipayProvider } from './alipay.js';
