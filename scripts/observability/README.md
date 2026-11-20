# 可观测性栈配置

本目录是希尔薇图集本地可观测性栈的配置文件目录，整体为 **Grafana 全家桶 + Alloy 采集器**，通过 `scripts/docker-compose.yml` 的 `observability` profile 按需启动，不参与默认 `up` / `reset`。

## 数据流

```text
API（@sylvie/observability / OTel SDK）
  ├─ traces / metrics ──OTLP(4317/4318)──► Alloy ──► Prometheus（指标） / Tempo（链路）
  └─ pino JSON 日志（容器 stdout）
        └──────── Docker 日志 ──────────► Alloy ──► Loki

Grafana ──► Prometheus / Loki / Tempo（trace_id 相互跳转）
```

## 文件职责

| 文件 | 职责 |
|---|---|
| [`alloy.alloy`](./alloy.alloy) | 统一采集入口：OTLP 接收、批量、转发；Docker 日志采集 |
| [`prometheus.yml`](./prometheus.yml) | Prometheus 自身抓取配置（不主动抓业务指标） |
| [`loki.yml`](./loki.yml) | 单机 Loki 存储与保留策略 |
| [`tempo.yml`](./tempo.yml) | Tempo 链路存储 |
| [`grafana/provisioning/datasources/datasources.yml`](./grafana/provisioning/datasources/datasources.yml) | 自动配置三大数据源与联动 |
| [`grafana/provisioning/dashboards/dashboards.yml`](./grafana/provisioning/dashboards/dashboards.yml) | 自动加载看板目录 |
| [`grafana/dashboards/sylvie-api.json`](./grafana/dashboards/sylvie-api.json) | 预置的 API 看板 |

## 1. Alloy：唯一的采集入口

[`alloy.alloy`](./alloy.alloy) 分四段：

1. **OTLP 接收**：`otelcol.receiver.otlp` 同时开 gRPC `4317` 与 HTTP `4318`，API 推送的 traces / metrics 都从这里进来。
2. **批量转发**：`otelcol.processor.batch` 每 5 秒打包一次，再分发给两个 exporter。
3. **指标与链路**：
   - 指标走 `otelcol.exporter.prometheus` → `prometheus.remote_write` → `http://prometheus:9090/api/v1/write`（因此 Prometheus 启动时带了 `--web.enable-remote-write-receiver`）。
   - 链路走 `otelcol.exporter.otlp` → `tempo:4317`（内部网络，不暴露到宿主机）。
4. **日志**：`discovery.docker` 通过挂载的 Docker socket 发现容器，`discovery.relabel` 只保留 `sylvie-*` 容器，并写入 `container`、`service`（compose 服务名，如 `api`）、`stream` 标签，然后 `loki.source.docker` → `loki.write` → `http://loki:3100/loki/api/v1/push`。

注意：日志采集的是**容器 stdout**，所以本地 `pnpm dev` 直接打印到终端的 pino 日志不会进 Loki，只有容器化的 API 日志会被采集。

## 2. Prometheus：只做存储与自监控

[`prometheus.yml`](./prometheus.yml) 只有两个抓取任务：

- `prometheus`：抓自己，便于确认实例存活；
- `alloy`：抓 `alloy:12345`，用于排查采集链路是否正常。

业务指标不是抓出来的，而是 Alloy remote write 写进来的。保留期由 compose 的 `PROMETHEUS_RETENTION`（默认 15d）控制。

## 3. Loki：单机文件存储

[`loki.yml`](./loki.yml) 要点：

- `auth_enabled: false`，本地不做鉴权；
- TSDB schema v13 + filesystem 存储，单副本；
- `allow_structured_metadata: true`，让 pino JSON 里的 `trace_id` 等字段可检索；
- 保留 7 天（`retention_period: 168h`），compactor 负责清理。

## 4. Tempo：本地链路存储

[`tempo.yml`](./tempo.yml) 开启 OTLP gRPC/HTTP 接收，trace 落本地 `/var/tempo/traces`，WAL 在 `/var/tempo/wal`。未配置额外保留周期，属于开发环境的最小配置。

## 5. Grafana 自动配置与联动

[`datasources.yml`](./grafana/provisioning/datasources/datasources.yml) 预置三个数据源，核心是双向跳转：

- **Loki → Tempo**：用正则 `"trace_id":"([0-9a-f]+)"` 从 pino JSON 提取 `trace_id`，日志行上出现「查看链路」链接。
- **Tempo → Loki**：`tracesToLogsV2` 按 `trace_id` 过滤，`service.name` 映射到 Loki 的 `container` 标签，时间窗口前后各 5 分钟。
- **Tempo → Prometheus**：启用 service map 与 node graph，用于查看服务依赖图。

[`dashboards.yml`](./grafana/provisioning/dashboards/dashboards.yml) 每 30 秒扫描 `/var/lib/grafana/dashboards`，把 JSON 看板放进「希尔薇图集」目录，允许 UI 修改。

[`sylvie-api.json`](./grafana/dashboards/sylvie-api.json) 是「希尔薇图集 · API 可观测性」看板，默认看最近 6 小时、30 秒刷新，包含：

- 统计卡：请求速率、5xx 错误率、P95 延迟、MCP 工具失败次数；
- 时序图：各路由请求速率 / P95、MCP 工具调用速率 / P95；
- 日志面板：API 容器日志。

## 启动与配置生效

```powershell
pwsh ./manage.ps1 obs          # 或 docker compose --profile observability up -d
```

启动后还需在 `scripts/.env` 或 `apps/api/.env` 设置：

```bash
OBSERVABILITY_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318   # 容器内 API
# 本机 pnpm dev 时改为 http://127.0.0.1:4318
```

端口：Grafana `3030`、Prometheus `9090`、Loki `3100`、Tempo `3200`、Alloy UI `12345`。

- 改 `alloy.alloy`、`prometheus.yml`、`loki.yml`、`tempo.yml` 后需要重启对应容器（`manage.ps1 restart -Target obs`）；其中看板文件 30 秒自动重载。
- 数据卷为 `alloy_data` / `prometheus_data` / `loki_data` / `tempo_data` / `grafana_data`，`reset` 会一并清空。

## 常见改动位置

- 新增业务指标 / span：在 API 代码里用 `observability.counter` / `histogram` / `withSpan`，配置侧无需改。
- 新增日志检索字段：pino `mixin` 写入字段后，在 `datasources.yml` 的 `derivedFields` 或看板里引用。
- 新增采集容器：`alloy.alloy` 的 `discovery.relabel` 里 `regex = "/sylvie-.+"` 需要放宽。
- 新增看板：把 JSON 放进 `grafana/dashboards/` 即可自动加载。
