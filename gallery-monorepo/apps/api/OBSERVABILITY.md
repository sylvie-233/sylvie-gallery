# 希尔薇图集 API · 可观测性使用说明

API 通过共享包 [`@sylvie/observability`](../../packages/observability/README.md) 接入 OpenTelemetry：一次请求同时产出 **Trace（链路）+ Metrics（指标）+ Logs（结构化日志）**，三者通过 `trace_id` 关联，可在 Grafana 中互相跳转。

```
Hono 请求
  ├─ instrumentation-http 入站 span ─┐
  ├─ Hono 中间件（复用 span、HTTP 指标、注入 trace 上下文）
  ├─ pino JSON 日志（trace_id / span_id）→ stdout
  └─ OTLP ─→ Alloy ─┬─→ Prometheus（指标）
                     ├─→ Tempo（链路）
                     └─→ Loki（容器日志）
                          └─→ Grafana（查询 / 看板 / 联动）
```

## 1. 开启

### Docker Compose

编辑 `scripts/.env`：

```env
OBSERVABILITY_ENABLED=true
OTEL_SERVICE_NAME=sylvie-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318
OTEL_TRACES_ENABLED=true
OTEL_METRICS_ENABLED=true
OTEL_TRACE_SAMPLE_RATIO=1
OTEL_METRIC_EXPORT_INTERVAL=15000
```

启动采集栈并重建 API（环境变量变更后必须重建容器）：

```bash
pwsh ./manage.ps1 obs
# 或
docker compose -f scripts/docker-compose.yml --profile observability up -d

# 让 API 读取新的环境变量
docker compose -f scripts/docker-compose.yml up -d api
```

### 本机热更新

编辑 `apps/api/.env`，端点改为宿主机端口：

```env
OBSERVABILITY_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
```

然后重启 `pnpm dev:api`。可观测性 SDK 必须在 mysql2 / node:http / ioredis 等模块加载前启动，API 已在 `main.ts` 入口用顶层 `await` 保证顺序，业务代码不需要额外处理。

### 验证是否生效

```bash
# 启动日志应出现「可观测性已启动」
docker logs sylvie-api 2>&1 | grep 可观测性

# 非忽略请求应返回 x-trace-id
curl -s -D - -o /dev/null http://localhost:3000/api/albums | grep -i x-trace-id
```

> 默认忽略 `/health`、`/api/docs`、`/api/openapi.json`，这些请求不会产生 span、指标与 `x-trace-id`。

## 2. 最快查看方式

打开 Grafana：**http://localhost:3030**，账号 `admin / 123456`（由 `scripts/.env` 的 `GRAFANA_ADMIN_*` 控制，生产务必修改）。

### 从 trace_id 看整条链路

1. 从请求响应头或日志中拿到 `x-trace-id` / `trace_id`：

   ```bash
   curl -s -D - -o /dev/null http://localhost:3000/api/albums
   # x-trace-id: 6f3ff0534047985fc3caf9d9871d3009

   docker logs sylvie-api 2>&1 | grep trace_id | tail -3
   ```

2. Grafana → **Explore** → 数据源选择 **Tempo** → 输入 trace_id。
3. 可以看到本次请求的完整 span 树，例如：

   ```text
   GET /api/albums                    （服务端 span）
   ├─ SELECT                          （mysql2 查询）
   ├─ SELECT
   └─ SELECT
   ```

   每个 span 都包含耗时、状态与属性；数据库查询以 `SELECT` 等 span 呈现，`db.query.text` 记录 SQL 结构，参数已脱敏为 `?`（包内默认开启 `maskStatement`），可定位慢查询发生在哪一步而不会把邮箱、令牌等业务值写入 Tempo。

也可以直接调 Tempo HTTP API：

```bash
curl http://localhost:3200/api/traces/<trace_id>
```

### 从日志跳到链路

Grafana → **Explore** → 数据源 **Loki** → 查询：

```logql
{service="api"}
```

每条日志都是 pino JSON，包含 `trace_id` / `span_id`。展开日志详情后点击 **「查看链路」**（已通过 derived field 配置），会跳到 Tempo 对应 trace。

常用 LogQL：

```logql
# 只看错误
{service="api"} | json | level >= 40

# 按 trace_id 过滤
{service="api"} |= "<trace_id>"

# 按请求路径过滤
{service="api"} |= "/api/albums"
```

### 从指标定位异常

Grafana 看板：**http://localhost:3030/d/sylvie-api-observability**

看板包含：

- 请求速率、5xx 错误率、P95 延迟
- 各路由 QPS / P95
- MCP 工具调用速率 / P95 / 失败次数
- API 容器日志（可直接点击 TraceID 跳 Tempo）

排查顺序通常是：**指标发现异常 → Loki 找到具体日志和 trace_id → Tempo 查看慢在哪一步**。

## 3. 指标说明

| 指标 | Prometheus 名称 | 说明 |
|---|---|---|
| HTTP 请求数 | `sylvie_http_server_requests_total` | 标签：`http_route` / `http_request_method` / `http_response_status_code` / `service_name` |
| HTTP 耗时 | `sylvie_http_server_request_duration_seconds` | 直方图，含 `_bucket` / `_sum` / `_count` |
| MCP 工具调用数 | `sylvie_mcp_tool_calls_total` | 标签：`mcp_tool_name` / `mcp_tool_outcome` |
| MCP 工具失败数 | `sylvie_mcp_tool_errors_total` | 同上 |
| MCP 工具耗时 | `sylvie_mcp_tool_duration_seconds` | 直方图 |

常用 PromQL：

```promql
# 全站 QPS
sum(rate(sylvie_http_server_requests_total[5m]))

# 各路由 QPS
sum by (http_route) (rate(sylvie_http_server_requests_total[5m]))

# 各路由 P95 延迟
histogram_quantile(0.95,
  sum by (le, http_route) (rate(sylvie_http_server_request_duration_seconds_bucket[5m])))

# 5xx 占比
sum(rate(sylvie_http_server_requests_total{http_response_status_code=~"5.."}[5m]))
  / clamp_min(sum(rate(sylvie_http_server_requests_total[5m])), 0.001)

# MCP 工具失败
sum by (mcp_tool_name) (rate(sylvie_mcp_tool_errors_total[5m]))
```

也可以在 Prometheus 直接查：http://localhost:9090，或通过 API：

```bash
curl -G 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sylvie_http_server_requests_total{service_name="sylvie-api"}'
```

## 4. 链路（Trace）说明

自动埋点覆盖：

- **HTTP 入站**：`instrumentation-http` 创建服务端 span，Hono 中间件复用它并补充 `http.route`、状态码，避免重复 span。
- **MySQL**：`instrumentation-mysql2` 生成 `SELECT` 等数据库 span。
- **Redis**：`instrumentation-ioredis` / `redis` 生成缓存与限流 span。
- **RabbitMQ**：`instrumentation-amqplib` 生成消息队列 span。
- **S3 / AWS SDK**：`instrumentation-aws-sdk` 生成对象存储调用 span。
- **出站 HTTP**：`instrumentation-undici` 生成外部请求 span。
- **MCP 工具**：`MCP <tool_name>` span，记录工具名、结果与耗时。

默认关闭噪声较大的埋点（`fs`、`dns`、`net`、`pino` 等），可按需在 `scripts/.env` 中追加：

```env
OTEL_DISABLED_INSTRUMENTATIONS=aws-sdk,grpc
```

## 5. MCP 工具埋点

MCP 工具的每次调用都会自动产生：

- span：`MCP list_albums` / `MCP get_album` 等；
- 指标：`sylvie_mcp_tool_calls_total`、`sylvie_mcp_tool_errors_total`、`sylvie_mcp_tool_duration_seconds`；
- 日志：工具内部日志沿当前请求的 `trace_id` 关联。

API 在 `createMcpServer` 中包装了 `registerTool`，新增工具无需手工埋点。查看方式：

- Grafana 看板里的「MCP 工具调用速率」「MCP 工具 P95 耗时」；
- Tempo 中按 trace_id 查看 `MCP xxx` 子 span；
- Loki 中按同一条 trace_id 查看工具执行期间产生的业务日志。

## 6. 新增自定义埋点

`withSpan`：

```ts
import { observability } from '../observability/index.js';

await observability.withSpan(
  'order.settle',
  async (span) => {
    span.setAttribute('order.id', orderId);
    await settleOrder(orderId);
  },
  { kind: 'internal' },
);
```

自定义指标（可在启动前创建，延迟绑定）：

```ts
const orderCounter = observability.counter('sylvie.order.created', {
  description: '新建订单数',
});
orderCounter.add(1, { channel: 'alipay' });

const settleDuration = observability.histogram('sylvie.order.settle.duration', {
  description: '订单履约耗时',
  unit: 's',
});
settleDuration.record(durationSeconds, { channel: 'alipay' });
```

约定：

- 指标属性只用低基数值（如路由模板、状态码、渠道）；不要放用户 ID、完整 URL、trace_id。
- span 名称使用固定业务名，不要把 ID 拼进名称。
- 自定义指标同样会按 OpenTelemetry → Prometheus 规则转换：计数器补 `_total`，`unit: 's'` 的直方图补 `_seconds`。

## 7. 常用运维命令

```bash
# 启动 / 更新可观测性栈
pwsh ./manage.ps1 obs

# 查看各容器状态
docker ps --filter name=sylvie-

# API 日志（含 trace_id）
docker logs -f sylvie-api

# 采集链路日志
docker logs -f sylvie-alloy

# 重建 API 使环境变量生效
docker compose -f scripts/docker-compose.yml up -d api

# Grafana / Prometheus / Tempo / Loki 健康检查
curl -s -u admin:123456 http://localhost:3030/api/health
curl -s http://localhost:9090/-/healthy
curl -s http://localhost:3200/ready
curl -s http://localhost:3100/ready
```

Alloy 是否收到数据，可查自身指标：

```bash
curl -G 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=otelcol_receiver_accepted_spans_total'
curl -G 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=otelcol_receiver_accepted_metric_points_total'
```

## 8. 常见问题

### 响应没有 `x-trace-id`，日志没有 `trace_id`

1. `docker inspect sylvie-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep OBSERVABILITY`，确认是 `true`；
2. 修改 `scripts/.env` 后是否执行了 `up -d api` 重建容器（仅 `restart` 不会更新 env）；
3. 是否访问了默认忽略路径 `/health`、`/api/docs`、`/api/openapi.json`；
4. 端点是否正确：容器内 `http://alloy:4318`，本机 dev `http://127.0.0.1:4318`。

### Tempo 里查不到链路

1. 确认 Alloy 收到 span：`otelcol_receiver_accepted_spans_total > 0`；
2. Tempo 有批量导出延迟（默认几秒），刚请求完可稍等再查；
3. 采样率小于 1 时，未采样请求有 trace_id 但不会进入 Tempo；
4. TraceQL Search 依赖 block 落盘，刚产生的链路可能搜不到；**按 trace_id 查是实时的**。

### Loki 里没有 API 日志

1. Alloy 容器必须挂载 Docker socket（compose 已配置 `/var/run/docker.sock`）；
2. 查询用 `{service="api"}` 或 `{container="sylvie-api"}`；
3. 本机 `pnpm dev` 的日志输出到终端，不进 Docker，因此不在 Loki 中；
4. 生产环境 pino 输出 JSON；开发环境彩色输出无法被 Loki 按 JSON 解析。

### Prometheus 里没有指标

1. 指标导出间隔默认 15 秒，稍等再看；
2. 指标名会按规则转换：`sylvie.http.server.requests` → `sylvie_http_server_requests_total`；
3. 确认 Prometheus 以 `--web.enable-remote-write-receiver` 启动（compose 已配置）；
4. 在 Prometheus 直接搜 `sylvie_`，或查 `sylvie_http_server_requests_total{service_name="sylvie-api"}`。

### 重启 API 后 Admin 登录 502

原因是 Admin Nginx 缓存了旧 API 容器 IP。当前配置已改为运行时 DNS 解析；若使用旧镜像仍出现：

```bash
docker compose -f scripts/docker-compose.yml build admin
docker compose -f scripts/docker-compose.yml up -d admin
```

并查看 `docker logs sylvie-admin` 是否还有 `connect() failed ... upstream`。

### Grafana 打不开 / 登录失败

```bash
docker ps --filter name=sylvie-grafana
docker logs sylvie-grafana 2>&1 | tail -20
```

默认端口 `3030`，账号来自 `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`。

## 9. 生产建议

- 高流量环境把 `OTEL_TRACE_SAMPLE_RATIO` 调到 `0.1 ~ 0.2`，避免链路存储膨胀。
- 修改 Grafana 默认密码；不要把 Alloy 的 `4317/4318/12345`、Prometheus、Loki、Tempo 端口直接暴露到公网。
- 数据保留：Prometheus 默认 `15d`（`PROMETHEUS_RETENTION`），Loki 7 天，Tempo block 视配置而定；按磁盘容量调整。
- 多实例部署时保持 `OTEL_SERVICE_NAME` 一致、`service.instance.id` 不同（SDK 自动生成），指标按 `instance` 区分。
- 对接 Grafana Cloud 或需要鉴权的 OTLP 网关时，配置：

  ```env
  OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway.example.com
  OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic xxx
  ```

- 关闭可观测性只需 `OBSERVABILITY_ENABLED=false` 并重建 API；此时不加载 OpenTelemetry SDK，零额外运行时开销。

## 10. 相关文件

| 文件 | 说明 |
|---|---|
| `apps/api/src/observability/index.ts` | env → 可观测性配置装配 |
| `apps/api/src/main.ts` | SDK 启动顺序与优雅关闭 |
| `apps/api/src/app.ts` | Hono 中间件注册位置 |
| `apps/api/src/utils/logger.ts` | pino `mixin` 注入 trace 字段 |
| `apps/api/src/mcp/instrumentation.ts` | MCP 工具统一埋点 |
| `packages/observability/README.md` | 共享包 API、配置项与设计边界 |
| `scripts/observability/` | Alloy / Prometheus / Loki / Tempo / Grafana 配置 |
| `scripts/docker-compose.yml` | `observability` profile 编排 |
