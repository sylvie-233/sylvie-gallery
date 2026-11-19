# @sylvie/db

希尔薇图集的共享数据库层：基于 [Drizzle ORM](https://orm.drizzle.team/) 与 `mysql2`，提供 MySQL 连接池、类型化的表结构映射、参数化 SQL 与事务辅助函数。

## 定位

- **表结构映射**：`src/schema/` 用 Drizzle 描述 25 张表，与 `docs/美女写真网站-v1数据库设计.sql` 一一对应，作为 TypeScript 类型来源。
- **连接与查询封装**：`DatabaseClient` 统一管理连接池，业务读写以参数化 SQL 为主，Drizzle 查询构建器作为补充。
- **共享包**：前台、管理后台、API 共用；数据库本身只有一套，Web 与 Admin 通过 API 访问。

本包**不负责生成或执行迁移**。建表与种子数据由 `scripts/init/` 下的 SQL 在容器首次启动时执行，修改表结构时必须同步 SQL 设计文件。

## 安装

包位于 pnpm 工作区内，在消费方 `package.json` 中声明即可：

```json
{
  "dependencies": {
    "@sylvie/db": "workspace:*"
  }
}
```

或在仓库根执行：

```bash
pnpm --filter @sylvie/api add @sylvie/db --workspace
```

## 目录结构

```
packages/db/
├── src/
│   ├── client.ts          # DatabaseClient、事务连接查询辅助
│   ├── index.ts           # 包入口：导出客户端、schema、常用 Drizzle 算子
│   └── schema/
│       ├── index.ts       # schema 汇总导出
│       ├── user.ts        # 用户、签到、通知、验证码
│       ├── author.ts      # 作者、订阅
│       ├── album.ts       # 图集、媒体、标签关联、解锁、收藏
│       ├── tag.ts         # 标签
│       ├── content.ts     # 公告、评论、友情链接
│       ├── commerce.ts    # 会员套餐、支付订单
│       ├── system.ts      # 站点配置、字典、管理操作日志
│       ├── log.ts         # 浏览、下载、搜索日志
│       └── agent-token.ts # Agent / MCP 访问令牌
├── package.json
└── tsconfig.json
```

## 创建 DatabaseClient

连接参数由调用方从环境变量读取后传入，典型装配见 `apps/api/src/db/index.ts`：

```ts
import { DatabaseClient } from '@sylvie/db';

export const dbClient = new DatabaseClient({
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  connectionLimit: 10,
});
```

构造参数：

| 参数 | 说明 |
|---|---|
| `host` / `port` / `user` / `password` / `database` | MySQL 连接信息 |
| `connectionLimit` | 连接池上限，默认 `10` |
| `timezone` | 会话时区，默认 `+08:00` |

客户端实例：

| 成员 | 说明 |
|---|---|
| `pool` | mysql2 原生连接池 |
| `db` | Drizzle 查询构建器（已挂载全部 schema） |
| `query(sql, params)` | 参数化查询，返回多行 |
| `queryOne(sql, params)` | 参数化查询，返回首行或 `null` |
| `execute(sql, params)` | 执行写语句，返回 `ResultSetHeader` |
| `transaction(fn)` | 在单连接上开启事务 |
| `ping()` / `close()` | 健康检查 / 关闭连接池 |

进程退出前应调用 `await dbClient.close()`。

## Drizzle 查询示例

```ts
import { album, dbClient, desc, eq } from '@sylvie/db';

const list = await dbClient.db
  .select()
  .from(album)
  .where(eq(album.status, 'published'))
  .orderBy(desc(album.publishedAt))
  .limit(20);
```

`@sylvie/db` 根入口额外导出了 `and`、`asc`、`count`、`desc`、`eq`、`gte`、`inArray`、`isNull`、`lte`、`ne`、`or`、`sql` 等常用算子，消费方无需再安装 `drizzle-orm`。

> 本项目的列表计数、条件更新与冗余字段维护以参数化 SQL 为主；Drizzle 构建器主要用于类型化读取或简单写入。

## 事务示例

`transaction` 会从池中取一条连接并执行 `BEGIN / COMMIT / ROLLBACK`。回调内的所有语句**必须使用传入的 `conn`**，否则会落到池中的其它连接，不在同一事务内。

```ts
import { dbClient, executeOn, queryOneOn } from '@sylvie/db';

await dbClient.transaction(async (conn) => {
  const row = await queryOneOn<{ id: number }>(
    conn,
    'SELECT id FROM album WHERE id = ? FOR UPDATE',
    [albumId],
  );
  if (!row) throw new Error('图集不存在');

  await executeOn(
    conn,
    'INSERT INTO favorite (user_id, album_id) VALUES (?, ?)',
    [userId, albumId],
  );
  await executeOn(
    conn,
    'UPDATE album SET fav_count = fav_count + 1 WHERE id = ?',
    [albumId],
  );
});
```

可用的事务辅助函数：`queryOn`、`queryOneOn`、`executeOn`。

## 参数化 SQL 示例

占位符使用 mysql2 的 `?`，参数按顺序传入，禁止拼接用户输入：

```ts
import { dbClient } from '@sylvie/db';

const users = await dbClient.query<{ id: number; email: string }>(
  'SELECT id, email FROM user WHERE role = ? AND status = 1',
  ['member'],
);

const user = await dbClient.queryOne<{ id: number; points: number }>(
  'SELECT id, points FROM user WHERE email = ? AND is_deleted = 0',
  [email],
);

const result = await dbClient.execute(
  'UPDATE user SET points = points + ? WHERE id = ? AND points >= 0',
  [2, userId],
);
console.log(result.affectedRows);
```

业务 SQL 统一放在 `apps/api/src/sql/*.sql.ts`，以 `{ sql, params }` 形式返回，便于复用与审查。

## 表清单（25 张，按业务域）

### 用户与账号（4）

| 表 | 说明 |
|---|---|
| `user` | 用户账号、角色、积分余额、会员有效期 |
| `user_checkin` | 每日签到（同日唯一） |
| `user_notification` | 站内通知（审核 / 更新 / 权益 / 系统） |
| `verify_code` | 邮箱验证码（注册 / 找回密码，一次性） |

### 作者（2）

| 表 | 说明 |
|---|---|
| `author` | 作者资料与收录套数冗余计数 |
| `subscription` | 用户订阅作者（防重复订阅） |

### 图集（5）

| 表 | 说明 |
|---|---|
| `album` | 图集主表、发布状态、推荐标记、冗余计数 |
| `album_image` | 图片/视频媒体，1-3 为未解锁预览位 |
| `album_tag` | 图集-标签关联 |
| `album_unlock` | 积分永久解锁记录 |
| `favorite` | 收藏 |

### 标签（1）

| 表 | 说明 |
|---|---|
| `tag` | 标签及收录数冗余 |

### 内容与互动（3）

| 表 | 说明 |
|---|---|
| `announcement` | 公告 |
| `comment` | 评论/回复（先审后发） |
| `friend_link` | 友情链接 |

### 交易（2）

| 表 | 说明 |
|---|---|
| `membership_plan` | 会员套餐（价格以分为单位） |
| `pay_order` | 支付订单（vip / unlock、退款留痕、admin 赠送单） |

### 系统与运维（4）

| 表 | 说明 |
|---|---|
| `sys_config` | 站点配置键值对 |
| `sys_dict_type` | 字典类型 |
| `sys_dict_data` | 字典项 |
| `admin_op_log` | 管理后台写操作日志 |

### 行为日志（3）

| 表 | 说明 |
|---|---|
| `user_view_log` | 浏览记录（PV/UV、推荐依据） |
| `download_log` | 下载记录（统计与限次风控） |
| `search_log` | 搜索词日志（热词统计） |

### Agent 接入（1）

| 表 | 说明 |
|---|---|
| `agent_token` | Agent / MCP 访问令牌（仅存哈希） |

## 新增 / 修改表的流程

1. **先改设计文件**：在 `docs/美女写真网站-v1数据库设计.sql` 中新增或调整 DDL，同步表头清单、字段注释与索引。
2. **再改 Drizzle schema**：在 `src/schema/` 对应领域文件中新增 `mysqlTable`；列名用 snake_case，属性用 camelCase。
3. **导出 schema**：若新增了领域文件，在 `src/schema/index.ts` 追加 `export *`，否则 `DatabaseClient.db` 不会加载。
4. **补齐查询层**：在 `apps/api/src/sql/*.sql.ts` 增加参数化 SQL；接口涉及的类型同步到 `packages/types`。
5. **同步种子与初始化**：按需更新 `scripts/generate-demo-data.mjs` 与 `scripts/init/` 下的建表/演示数据 SQL。
6. **校验**：执行 `pnpm --filter @sylvie/db typecheck`、`build`、`lint`，并回归相关接口。

字段映射约定：

- 主键统一 `bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey()`。
- 时间字段统一 `datetime(..., { mode: 'string' })`，日期字段用 `date(..., { mode: 'string' })`；连接池设置 `dateStrings: true`，因此读取结果始终是字符串，应用层按北京时间处理。
- `BIGINT` 在本包中统一映射为 `number`（`mode: 'number'`），与 API 的 DTO 保持一致。
- 枚举字段使用 `mysqlEnum`，取值与 SQL 定义及 `packages/types` 中的常量保持一致。

## 注意事项

- **软删除优先**：使用 `is_deleted` / `status` 标记，不做物理删除；查询列表时默认带上过滤条件。
- **计数冗余**：`album.view_count` / `fav_count` / `download_count` / `comment_count`、`author.album_count`、`tag.use_count` 等冗余字段，必须与底层数据变更在同一事务（或紧随其后）维护，避免列表页统计漂移。
- **参数化 SQL**：所有外部输入通过 `?` 占位符传入，禁止字符串拼接。
- **事务连接**：事务回调内不要使用 `dbClient.query` / `dbClient.execute`，它们不持有事务连接。
- **连接释放**：`transaction` 内部已保证 `release()`；直接使用 `pool.getConnection()` 时需自行释放。
- **schema 仅作类型映射**：业务查询仍以 `apps/api/src/sql/*.sql.ts` 为主，不要在 schema 中堆积业务逻辑。
- **mysql2 类型补丁**：`src/mysql2-augment.ts` 为 `Pool` / `PoolConnection` 补回 `query` 方法。mysql2 3.x 通过声明合并（mixin）提供该方法，TypeScript 6 不再继承这类实例成员，而 VSCode 内置 TS 已是 6.x；补丁同时兼容仓库锁定的 TS 5.9。该文件只含类型，编译后为空模块，删除后 TS 6 环境会重新报 `Property 'query' does not exist on type 'Pool'`。
