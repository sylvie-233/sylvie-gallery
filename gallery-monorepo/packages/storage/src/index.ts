/**
 * @sylvie/storage 公共入口。
 *
 * 对外导出存储配置 / 结果类型、统一门面 `ObjectStorage` 与工厂 `createStorage`，
 * 以及 S3 / 本地文件两种底层实现（通常只需通过门面使用）。
 * 本包只封装对象存储的读写探测，不含图片处理等业务逻辑。
 */
export * from './types.js';
export { ObjectStorage, createStorage } from './storage.js';
export { S3Store } from './s3-store.js';
export { LocalStore } from './local-store.js';
