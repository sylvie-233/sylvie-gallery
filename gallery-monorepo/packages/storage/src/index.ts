/**
 * @sylvie/storage 公共入口。
 *
 * 对外导出存储配置 / 结果类型，以及 `ObjectStorage` 与工厂函数 `createStorage`。
 * 本包只封装 S3 兼容对象存储的读写探测，不含图片处理等业务逻辑。
 */
export * from './types.js';
export { ObjectStorage, createStorage } from './storage.js';
