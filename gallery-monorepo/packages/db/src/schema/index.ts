/**
 * Drizzle schema 汇总入口：按业务域拆分文件，全部表在此统一导出。
 * 新增领域文件时需在此追加 `export *`，否则不会被 `DatabaseClient.db` 加载。
 */
export * from './user.js';
export * from './author.js';
export * from './album.js';
export * from './tag.js';
export * from './content.js';
export * from './commerce.js';
export * from './system.js';
export * from './log.js';
export * from './agent-token.js';
