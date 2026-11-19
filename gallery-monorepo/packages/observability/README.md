# @sylvie/observability

基于 OpenTelemetry 的共享可观测性层：一条请求同时产出 **Trace + Metric + Log**，三者通过 `trace_id` 关联。业务只依赖 `createObservability` 门面，不直接接触 OpenTelemetry API；关闭时完全不加载 SDK，退化为 no-op。

## 定位

- **高封装**：对外只暴露 `Observability` 接口（span / 指标 / 日志字段 / Hono 中间件），OpenTelemetry 版本与 SDK 组件对业务不可见。
- **可插拔**：`enabled: false` 或分别关闭 traces / metrics 即可整体停用；自动埋点可按名称禁用；OTLP 端点、采样率、导出间隔均由调用方注入。
- **协议标准**：Traces / Metrics 以 OTLP HTTP 推送给 Grafana Alloy；日志仍由 pino 输出 JSON 到 stdout，由 Alloy 采集进 Loki。
- **零侵入工具埋点**：MCP 工具通过 `wrapToolHandler` 统一包 span 与指标，不需要逐个修改工具实现。

## 数据流

```
Hono 请求 ─┬─ instrumentation-http 入站 span（中间件复用并补路由）
           ├─ @sylvie/observability 中间件：HTTP 指标 + trace 上下文
           ├─ pino（mixin 注入 trace_id / span_id）→ stdout
           └─ OTLP ─→ Alloy ─┬─→ Prometheus（指标）
                              ├─→ Tempo（链路）
                              └─→ Loki（容器日志）
                                   Grafana 统一查询 / 联动 / 告警
```

## 目录结构

```
packages/observability/
├── src/
│   ├── index.ts          # 公共出口
│   ├── types.ts          # 配置、门面接口与对外类型
│   ├── observability.ts  # 门面实现、SDK 装配、工具调用包装
│   ├── middleware.ts     # Hono 中间件（span 复用、HTTP 指标、trace 响应头）
│   ├── span.ts           # SpanHandle 与 withSpan
│   ├── metrics.ts        # 延迟绑定计数器 / 直方图与内置指标
│   └── context.ts        # AsyncLocalStorage trace 上下文与日志字段
├── package.json
├── tsconfig.json
└── README.md
```

## 引入方式

```jsonc
// apps/api/package.json
{
  "dependencies": {
    "@sylvie/observability": "workspace:*"
  }
}
```

```ts
import { createObservability } from '@sylvie/observability';
import type {
  Observability,
  ObservabilityOptions,
  SpanHandle,
  TraceContext,
} from '@sylvie/observability';
```

## 快速开始

```ts
const observability = createObservability({
  enabled: true,
  serviceName: 'sylvie-api',
  environment: 'production',
  endpoint: 'http://alloy:4318',
  traces: { enabled: true, sampleRatio: 0.2 },
  metrics: { enabled: true, exportIntervalMillis: 15_000 },
});

// 必须在加载 mysql2 / node:http / ioredis 等被埋点模块之前启动！
await observability.start();

// Hono 最外层中间件
app.use('*', observability.middleware());

// 日志关联：pino mixin 自动写入 trace_id / span_id
const logger = createLogger({
  service: 'sylvie-api',
  mixin: () => observability.traceLogFields(),
});

// 手动埋点
await observability.withSpan('order.settle', async (span) => {
  span.setAttribute('order.id', orderId);
  await settle(orderId);
}, { kind: 'internal' });

// 自定义指标（可在 start 前创建，延迟绑定）
const orderCounter = observability.counter('sylvie.order.created', {
  description: '新建订单数',
});
orderCounter.add(1, { channel: 'alipay' });

// 退出前 flush
await observability.shutdown();
```

> **启动顺序很关键**：自动埋点通过 module hooks 在模块加载时打补丁。若先 `import` 了 `mysql2` / `node:http` / `ioredis`，再启动 SDK，这些模块不会被 patch。API 采用入口文件顶层 `await startObservability()` + 动态 `import('./app.js')` 保证顺序；接入其它服务时请照此处理。

## Hono 中间件行为

- **span 复用**：若 `instrumentation-http` 已创建入站 span，则直接复用并补充 `http.route`、`service.name`、状态码，避免重复 span；自动埋点关闭时由中间件自行创建。
- **忽略路径**：默认 `/health`、`/api/docs`、`/api/openapi.json` 不建 span、不记指标；同时会通过 `ignoreIncomingRequestHook` 关闭这些路径的入站埋点。
- **响应头**：非忽略请求返回 `x-trace-id`，方便前端与网关排障（CORS 需在 `exposeHeaders` 中放行）。
- **指标**：无论 span 是否复用，只记录一次 HTTP 请求数与耗时。

> 注意不要把所有请求都设为 `ignoreIncomingRequestHook: () => true`。OpenTelemetry 的 HTTP 埋点在忽略入站请求时会启用 tracing suppression，导致同请求内自行创建的 span 全部退化为 no-op。

## 内置指标

| 指标（OTel 名） | Prometheus 名 | 类型 | 主要标签 |
|---|---|---|---|
| `sylvie.http.server.requests` | `sylvie_http_server_requests_total` | Counter | `http_request_method` / `http_route` / `http_response_status_code` / `service_name` |
| `sylvie.http.server.request.duration` | `sylvie_http_server_request_duration_seconds_*` | Histogram | 同上 |
| `sylvie.mcp.tool.calls` | `sylvie_mcp_tool_calls_total` | Counter | `mcp_tool_name` / `mcp_tool_outcome` / `service_name` |
| `sylvie.mcp.tool.errors` | `sylvie_mcp_tool_errors_total` | Counter | 同上 |
| `sylvie.mcp.tool.duration` | `sylvie_mcp_tool_duration_seconds_*` | Histogram | 同上 |

名称按 OpenTelemetry → Prometheus 默认转换规则设计：计数器补 `_total`，`unit: 's'` 的直方图补 `_seconds` 并生成 `_bucket` / `_sum` / `_count`。

示例 PromQL：

```promql
# QPS（按路由）
sum by (http_route) (rate(sylvie_http_server_requests_total[5m]))

# P95 延迟
histogram_quantile(0.95,
  sum by (le, http_route) (rate(sylvie_http_server_request_duration_seconds_bucket[5m])))

# 5xx 占比
sum(rate(sylvie_http_server_requests_total{http_response_status_code=~"5.."}[5m]))
  / clamp_min(sum(rate(sylvie_http_server_requests_total[5m])), 0.001)

# MCP 工具失败率
sum by (mcp_tool_name) (rate(sylvie_mcp_tool_errors_total[5m]))
```

## 日志关联

`traceLogFields()` 返回 `{ trace_id, span_id }`，配合 `@sylvie/logger` 的 `mixin` 选项写入每条 JSON 日志。Grafana Loki 数据源会按 `"trace_id":"..."` 自动生成跳转 Tempo 的派生字段；Tempo 数据源也会按 trace_id 反查对应容器日志。

## MCP 工具埋点

```ts
await observability.wrapToolHandler('list_albums', () => listAlbums(input, adminId));
```

每次调用自动创建内部 span、记录 `sylvie.mcp.tool.*` 指标，并在异常时标记 ERROR。API 在 `createMcpServer` 中包装 `registerTool`，现有工具注册代码无需改动。

## 配置项

| 选项 | 默认值 | 说明 |
|---|---|---|
| `enabled` | — | 总开关；false 时不加载 SDK，所有能力 no-op |
| `serviceName` | — | 服务名，写入 resource、指标属性与 span 属性 |
| `serviceVersion` / `environment` | — | 写入 resource 与指标属性 |
| `endpoint` | SDK 默认 | OTLP HTTP 端点，自动补 `/v1/traces` / `/v1/metrics` |
| `headers` | — | OTLP 请求头，用于 Grafana Cloud 等鉴权 |
| `traces.enabled` | `true` | 是否导出链路 |
| `traces.sampleRatio` | `1` | 根 span 采样率 0~1；已有 `OTEL_TRACES_SAMPLER` 时以环境变量为准 |
| `metrics.enabled` | `true` | 是否导出指标 |
| `metrics.exportIntervalMillis` | `15000` | 指标导出间隔 |
| `instrumentations` | 推荐集合 | `false` 全部关闭；`{ disabled: ['aws-sdk'] }` 按名称禁用 |
| `resourceAttributes` | — | 追加 resource 属性 |
| `http.ignorePaths` | `/health`、`/api/docs`、`/api/openapi.json` | 不建 span / 不记指标的路径 |
| `http.exposeTraceId` | `true` | 是否返回 `x-trace-id` |

默认关闭的自动埋点：`fs`、`dns`、`net`、`pino`、`winston`、`bunyan`、`express`、`koa`、`hapi`、`connect`、`restify`、`router`、`graphql`、`mongoose`、`mongodb`、`pg`、`tedious`、`oracledb`、`cucumber`、`socket.io`、`openai`。保留 HTTP 出站、`undici`、`mysql2`、`ioredis`、`amqplib`、`aws-sdk` 等 API 实际使用的埋点。

## 与 API 集成位置

- 实例装配：`gallery-monorepo/apps/api/src/observability/index.ts`（env → 配置注入）。
- 启动顺序：`gallery-monorepo/apps/api/src/main.ts`（顶层 `await startObservability()`，业务模块动态导入）。
- 中间件：`gallery-monorepo/apps/api/src/app.ts`（最外层注册）。
- 日志关联：`gallery-monorepo/apps/api/src/utils/logger.ts`（`mixin: () => observability.traceLogFields()`）。
- MCP 埋点：`gallery-monorepo/apps/api/src/mcp/instrumentation.ts`（包装 `registerTool`）。
- 采集栈：`scripts/observability/` + `scripts/docker-compose.yml` 的 `observability` profile。

## 设计边界

- **不读环境变量**：与其它共享包一致，配置全部由调用方注入；API 侧从 `env` 读取 `OTEL_*` 并映射。
- **日志不重复上报**：pino 结构化日志走 stdout → Alloy → Loki；同时禁用 NodeSDK 的 OTLP 日志通道。
- **故障降级**：启动失败由调用方记录并继续提供业务；SDK 未启动时指标写入自动跳过，trace 字段返回空对象。
- **低基数**：HTTP 指标使用 `c.req.routePath`（路由模板）而非真实路径，避免 ID 造成时间序列爆炸。
- **关闭即零开销**：`start()` 直接返回，不动态加载任何 OTel 包。

## 注意事项

- **启动顺序**：见上文；这是自动埋点能否生效的前提。
- **采样与日志**：采样率小于 1 时，未采样请求仍有 trace_id（上下文有效），但不会进入 Tempo；这是分布式追踪的常规行为。
- **代理场景**：如需通过网关串联链路，请透传 `traceparent`；中间件会从入站头提取父上下文（自动埋点开启时由 instrumentation-http 完成）。
- **指标基数**：自定义指标属性不要使用用户 ID、URL 全路径等高基数值。
- **OTLP 端点**：容器内 API 使用 `http://alloy:4318`；本机 `pnpm dev` 使用 `http://127.0.0.1:4318`。
