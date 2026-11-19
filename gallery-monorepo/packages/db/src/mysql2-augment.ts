/**
 * mysql2 Promise API 的类型补丁（仅类型，运行时为空模块）。
 *
 * mysql2 3.x 的 `Pool` / `PoolConnection` 通过 `QueryableBase(ExecutableBase(EventEmitter))`
 * 这类声明合并（mixin）获得 `query` 方法。TypeScript 6.0 不再从该 mixin 表达式中
 * 继承实例成员，导致 VSCode（内置 TS 6）与 `tsc` 6 报
 * `Property 'query' does not exist on type 'Pool'`，而仓库锁定的 TS 5.9 正常。
 *
 * 这里按 mysql2 官方 `QueryableBase` 的签名补回 `query`，使包在 TS 5.x / 6.x
 * 下都能通过类型检查；运行时行为完全由 mysql2 提供。
 */
import type { FieldPacket, QueryOptions, QueryResult, QueryValues } from 'mysql2';

declare module 'mysql2/promise' {
  interface Pool {
    query<T extends QueryResult>(
      sql: string,
      values?: QueryValues,
    ): Promise<[T, FieldPacket[]]>;
    query<T extends QueryResult>(
      options: QueryOptions,
      values?: QueryValues,
    ): Promise<[T, FieldPacket[]]>;
  }

  // PoolConnection 在 mysql2 中以 class 声明，class 与 interface 可以合并。
  interface PoolConnection {
    query<T extends QueryResult>(
      sql: string,
      values?: QueryValues,
    ): Promise<[T, FieldPacket[]]>;
    query<T extends QueryResult>(
      options: QueryOptions,
      values?: QueryValues,
    ): Promise<[T, FieldPacket[]]>;
  }
}

export {};
