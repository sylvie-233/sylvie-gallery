/**
 * MySQL 连接与查询封装：提供 mysql2 连接池、Drizzle 查询构建器、
 * 参数化 SQL 与事务辅助函数。表结构定义见 `./schema`，与
 * `docs/美女写真网站-v1数据库设计.sql` 一一对应。
 */
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from 'mysql2/promise';

import * as schema from './schema/index.js';

/** 数据库连接参数：由调用方从环境变量读取后传入。 */
export interface DatabaseOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** 连接池上限，默认 10。 */
  connectionLimit?: number;
  /** 会话时区，默认 `+08:00`（应用层统一存北京时间）。 */
  timezone?: string;
}

/** 事务回调中拿到的连接：所有语句必须使用该连接，才能处于同一事务内。 */
export type TransactionConnection = PoolConnection;

/**
 * 共享数据库客户端：
 * - `db`：Drizzle 查询构建器（schema 见 `./schema`）；
 * - `query` / `queryOne` / `execute`：参数化 SQL；
 * - `transaction`：在同一连接上开启事务；
 * - `ping`：健康检查。
 */
export class DatabaseClient {
  /** mysql2 原生连接池：需要底层能力（如 `getConnection`）时使用。 */
  readonly pool: Pool;
  /** Drizzle 查询构建器，schema 为 `./schema` 中全部表。 */
  readonly db: MySql2Database<typeof schema>;

  /**
   * 创建客户端。
   *
   * 固定使用 `dateStrings: true`，因此 DATETIME / DATE 列均以字符串返回，
   * 避免时区二次转换；schema 中 BIGINT 统一映射为 `number`。
   */
  constructor(options: DatabaseOptions) {
    this.pool = mysql.createPool({
      host: options.host,
      port: options.port,
      user: options.user,
      password: options.password,
      database: options.database,
      waitForConnections: true,
      connectionLimit: options.connectionLimit ?? 10,
      queueLimit: 0,
      timezone: options.timezone ?? '+08:00',
      dateStrings: true,
      charset: 'utf8mb4',
    });
    this.db = drizzle(this.pool, { schema, mode: 'default' });
  }

  /**
   * 执行参数化查询并返回多行结果（占位符使用 `?`）。
   * 只能返回行集，写操作请用 `execute`。
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const [rows] = await this.pool.query(sql, params as unknown[]);
    return rows as unknown as T[];
  }

  /** 执行参数化查询并返回首行；无结果时返回 `null`。 */
  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /**
   * 执行 INSERT / UPDATE / DELETE 等写语句，返回 mysql2 的
   * `ResultSetHeader`（含 `insertId`、`affectedRows`）。
   */
  async execute(sql: string, params: readonly unknown[] = []): Promise<ResultSetHeader> {
    const [result] = await this.pool.query(sql, params as unknown[]);
    return result as ResultSetHeader;
  }

  /**
   * 在同一连接上开启事务：回调正常返回则提交，抛错则回滚并重新抛出。
   * 回调内的 SQL 必须通过传入的 `conn`（配合 `queryOn` / `executeOn`）执行，
   * 不能使用 `this.db` 或 `this.query`，否则会落到池中的其它连接上。
   */
  async transaction<T>(fn: (conn: TransactionConnection) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /** 健康检查：执行 `SELECT 1`，失败时抛出连接错误。 */
  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  /** 关闭连接池，进程退出前调用。 */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** 事务连接上的参数化查询，返回多行结果。 */
export async function queryOn<T = Record<string, unknown>>(
  conn: TransactionConnection,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const [rows] = await conn.query(sql, params as unknown[]);
  return rows as unknown as T[];
}

/** 事务连接上的参数化查询，返回首行或 `null`。 */
export async function queryOneOn<T = Record<string, unknown>>(
  conn: TransactionConnection,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await queryOn<T>(conn, sql, params);
  return rows[0] ?? null;
}

/** 事务连接上的写语句执行，返回 `ResultSetHeader`。 */
export async function executeOn(
  conn: TransactionConnection,
  sql: string,
  params: readonly unknown[] = [],
): Promise<ResultSetHeader> {
  const [result] = await conn.query(sql, params as unknown[]);
  return result as ResultSetHeader;
}
