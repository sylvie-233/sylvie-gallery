/**
 * `@sylvie/payment` 包入口：导出公共类型与支付宝实现。
 *
 * 业务侧通常用 `createAlipayProvider` 创建实例；
 * 接入其他服务商时实现 `PaymentProvider` 接口即可，无需改动入口导出结构。
 */
export * from './types.js';
export { AlipayProvider, createAlipayProvider } from './alipay.js';
