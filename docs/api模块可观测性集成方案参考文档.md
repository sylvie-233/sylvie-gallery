# 整套栈全景：Hono + OpenTelemetry + Alloy + Prometheus + Loki + Tempo + Grafana

先把**所有组件角色**讲清楚，再按**从应用输出 → 采集 → 存储 → 查询可视化 → 告警**完整流程串一遍，同时区分：**Hono 里面的中间件**、**独立 Agent（Alloy）**、**后端存储服务**。

> 
> 目标：你的 Hono API（含 MCP `/mcp`），一条请求同时产出 `Metrics + Trace + Log`，并且三者通过 `trace_id` 关联，在 Grafana 里互相跳转排查。

## 一、组件清单 & 各自作用

### 1）应用侧（Hono 服务内部，TypeScript）

1. **OpenTelemetry SDK（OTel）**
   - 不是 Hono 原生中间件，是标准埋点 SDK，配套 Hono OTel 中间件
   - 能干两件事：
     - **Trace（链路）**：自动给 HTTP 请求生成 `trace_id / span_id`；手动埋 MCP Tool、Drizzle 数据库调用、Redis 调用的 span；记录每一步耗时、错误。
     - **Metrics（指标）**：自动采集 HTTP QPS、延迟、错误码；你可以手动埋自定义指标：`mcp_tool_calls_total`、`mcp_tool_error_total`。
   - 输出：OTLP 协议（标准），推送给 Alloy（或者直接推给后端）
2. **Pino（结构化日志）**
   - Hono 日志中间件，输出 JSON 结构化日志
   - **关键：日志里强制注入当前请求的 `trace_id`**
   - 日志内容：请求信息、MCP 会话 ID、tool 名称、入参、审计信息、异常堆栈
   - 输出：stdout / 日志文件，由 Alloy 采集
3. **Hono 配套中间件（你业务层的）**
   - OTel Hono 中间件：自动捕获路由、状态码、耗时、注入 trace 上下文
   - 全局异常中间件：报错时把异常、trace_id 打进 pino 日志
   - RequestId 中间件（可选，一般 OTel 的 trace_id 就够用）

> 
> ✅ 一句话：**Hono 负责产生三类可观测数据：OTel 输出 trace+metrics、pino 输出带 trace_id 的结构化日志**

### 2）采集层：Grafana Alloy（核心统一采集 Agent，替代 Promtail + OTel Collector 两套）

> 
> Alloy 是一个独立进程，和 Hono 分开跑，docker 里单独容器

- 它是一个**统一接收器 + 转发器 + 预处理**，一个程序同时接收三类数据：
  1. 接收 OTLP（来自 Hono OTel SDK）→ 里面包含 Trace + Metrics
  2. 读取容器 stdout / 日志文件（Hono 的 pino 日志）→ 日志数据
- 内部预处理能力：
  - 打标签（label）：`service_name="api-hono"`、`env="prod"`
  - 过滤、脱敏、丢弃无用日志
  - 格式转换
- 转发路由：
  - Metrics → 推给 **Prometheus**
  - Trace → 推给 **Tempo**
  - Logs → 推给 **Loki**

> 
> 对比老方案：以前是 OpenTelemetry Collector（收 trace/metrics）+ Promtail（收日志）两个组件；Alloy 一个搞定，少维护一套。

### 3）存储查询层（三个独立存储服务）

1. **Prometheus：存 Metrics 时序指标**
   - 接收 Alloy 送来的指标（QPS、延迟、MCP 调用计数、错误率）
   - 按时间序列存储，提供 PromQL 查询，适合做大盘、告警
   - 特点：高压缩、适合数值，**不存日志、不存完整链路详情**
2. **Loki：存结构化日志**
   - 接收 Alloy 送来的 JSON 日志（pino 日志）
   - 按标签索引，LogQL 查询；**靠 trace_id 关联链路**
   - 特点：不做全文分词，资源占用远低于 ES；适合排查异常时看上下文
3. **Tempo：存 Trace 链路数据**
   - 接收 Alloy 送来的 span 链路
   - 只存完整调用链，**本身不做文本检索**；你不能直接在 Tempo 搜 “报错关键词”
   - 标准用法：先在指标 / 日志里拿到 `trace_id`，再拿着 trace_id 去 Tempo 查整条链路

### 4）可视化 & 告警层：Grafana

- 统一 UI，同时接入 3 个数据源：Prometheus、Loki、Tempo
- 能力：
  - 做指标大盘：HTTP 请求 P95、MCP 工具调用统计、数据库慢查询、错误率
  - 日志检索面板：查审计日志、异常日志
  - 链路查看面板：输入 trace_id，看整条调用链（Hono 路由 → MCP tool → Drizzle SQL → Redis）
  - 联动跳转：指标上看到异常 → 点一下，自动跳对应 trace；从 trace 里点日志，跳 Loki 看这条链路的全部日志
  - 告警规则：在 Grafana 配置 PromQL 告警，触发后推钉钉 / 企业微信

## 二、完整数据流步骤（按顺序）

### Step1：Hono 收到请求（普通 REST 或者 MCP /mcp 的 Streamable HTTP 会话）

1. OTel Hono 中间件拦截请求，生成全局 `trace_id`，创建根 span
2. 路由执行业务逻辑：
   - 调用 MCP Tool：手动新建 span，记录 tool 名称、入参、是否成功
   - 调用 Drizzle 查库：Drizzle OTel 埋点，生成 SQL span
   - 调用 Redis：Redis span
3. Pino 打印日志，**日志 JSON 里带上 `trace_id`**
```
{"level":"error","trace_id":"abc123","msg":"mcp tool execute failed","tool":"order_query"}
```
4. OTel SDK 把这条链路的 span、指标，以 OTLP 协议发给 Alloy

### Step2：Alloy 接收、分类、转发

1. 接收 OTLP 包：拆分出 metrics、trace
2. 读取容器 stdout，拿到 pino 输出的日志
3. 统一打上服务、环境标签
4. 路由转发：
   - metrics → Prometheus
   - traces → Tempo
   - logs → Loki

### Step3：三个存储分别落地数据

- Prometheus：时序指标落盘
- Tempo：整条 trace 的 span 集合落盘
- Loki：带标签 + trace_id 的日志落盘

### Step4：Grafana 查询、展示、告警

1. 大盘（Prometheus 数据源）：看 QPS、延迟、MCP 失败率，发现异常
2. 发现错误飙升 → 点异常，自动跳 Loki，查这个时间段错误日志
3. 在日志里拿到一条 `trace_id` → 跳转 Tempo，打开整条调用链，看是哪一步慢 / 报错（MCP 工具？SQL？Redis？）
4. 配置告警：比如 `mcp_tool_error_total > 0`，持续 1 分钟，推送告警

## 三、针对 MCP 场景的特殊注意点（你的重点）

MCP 是 Streamable HTTP 长会话，和普通一次性 HTTP 不一样：

1. trace_id 建议绑定**整个 MCP 会话**，而不是单条 HTTP 分片请求；否则一条 MCP 会话会产生一堆零散 trace，很难看
2. MCP Tool 调用，单独创建一个 span，记录 tool 名称、耗时、返回状态，埋自定义指标 `mcp_tool_calls_total{tool_name="xxx"}`
3. 审计日志同样带上 trace_id，后续合规审计和故障排查可以打通

## 四、两种部署模式区分

1. **单机 docker-compose（推荐你先跑通）**
Hono、Alloy、Prometheus、Loki、Tempo、Grafana 全部容器，同一台机器
适合开发、测试、中小流量，运维简单
2. **分布式生产（后期扩容）**
Prometheus → Mimir（分布式高可用指标存储），其余组件不变；适合多实例 Hono 集群

## 五、容易踩坑的两个概念澄清

1. ❌ 不是 Grafana 采集数据：Grafana**只查询、展示、告警**，不采集
2. ❌ Tempo 不能用来搜日志：Tempo 只存链路；检索关键词、看上下文日志，一定走 Loki；Tempo 靠 trace_id 做关联

## 六、最简依赖清单（给你整理落地顺序）

1. Hono + pino（日志）+ @opentelemetry/* 全套 SDK（埋点）
2. Grafana Alloy（采集）
3. Prometheus（指标存储）
4. Loki（日志存储）
5. Tempo（链路存储）
6. Grafana（可视化 + 告警）