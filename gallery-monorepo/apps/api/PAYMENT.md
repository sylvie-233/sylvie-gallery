# 希尔薇图集 API · 支付接入与履约流程

v1 的会员支付支持两种模式：

| 模式 | 配置 | 行为 |
|---|---|---|
| 模拟支付（默认） | `ALIPAY_MOCK=true` | 创建订单后可调用 `POST /api/orders/{orderNo}/pay` 直接视为支付成功 |
| 支付宝沙箱 / 生产 | `ALIPAY_MOCK=false` + 密钥 | 跳转支付宝收银台，异步通知验签后通过 RabbitMQ 幂等履约 |

两种模式最终都走同一个履约函数 `fulfillVipOrder`，区别只在「谁触发履约」：模拟模式由前端主动确认，真实模式由支付宝异步通知触发。

---

## 1. 参与组件

```
┌──────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────┐
│  前台 Web │────▶│   API (Hono) │────▶│  RabbitMQ  │────▶│  MQ 消费者 │
└──────────┘     └──────────────┘     └────────────┘     └──────────┘
      │                  │                                      │
      │ 跳转收银台        │ 创建 / 查询 / 通知                    │ 幂等履约
      ▼                  ▼                                      ▼
┌──────────┐     ┌──────────────┐                         ┌──────────┐
│ 支付宝    │────▶│  MySQL       │◀────────────────────────│ 会员 / 订单│
└──────────┘ 异步 │ pay_order    │                         └──────────┘
              通知 │ user         │
                   │ notification │
                   └──────────────┘
```

| 组件 | 职责 |
|---|---|
| `@sylvie/payment` | 生成收银台 URL、主动查询、异步通知验签 |
| `@sylvie/mq` | 持久化队列、confirm 发布、断线重连 |
| `apps/api/src/services/payment.service.ts` | 注入支付宝配置、密钥格式归一化 |
| `apps/api/src/services/order.service.ts` | `createVipOrder` 建单、`fulfillVipOrder` 幂等履约 |
| `apps/api/src/controllers/order.controller.ts` | 接口编排、通知入队 / 同步兜底 |
| `apps/api/src/mq/index.ts` | 支付事件发布与消费 |
| `apps/api/src/jobs` | 履约后登记会员到期延时通知 |

---

## 2. 数据与状态

### 订单状态 `pay_order.status`

| 状态 | 含义 | 产生方式 |
|---|---|---|
| `created` | 已创建、待支付 | `POST /api/orders/vip` |
| `paid` | 已支付、权益已发放 | `fulfillVipOrder` |
| `closed` | 已关闭 | 支付宝关闭交易 / 后续扩展 |
| `refunded` | 已退款、权益已收回 | 后台退款 |

关键字段：

- `order_no`：应用侧订单号，传给支付宝的 `out_trade_no`；
- `trade_no`：支付宝流水号，履约时写入；
- `amount_cents`：订单金额（分）；
- `paid_at`：支付时间。

### 会员有效期

`user.vip_expire_at` 的叠加规则：

```sql
vip_expire_at = DATE_ADD(GREATEST(COALESCE(vip_expire_at, NOW()), NOW()), INTERVAL vip_days DAY)
```

- 未过期：在剩余时间上叠加；
- 已过期或首次开通：从当前时间起算；
- `role` 置为 `vip`（`admin` 保持 `admin`）。

---

## 3. 真实支付的主流程

### 3.1 创建订单

```
前端                     API                         MySQL / 支付宝
 │  POST /api/orders/vip   │                              │
 │────────────────────────▶│ 校验套餐（status=1）          │
 │                         │─────────────────────────────▶│
 │                         │ 写入 pay_order(status=created)│
 │                         │─────────────────────────────▶│
 │                         │ pageExec('alipay.trade.page.pay')
 │                         │  → 收银台 URL（含签名）        │
 │◀────────────────────────│ { order, payment: {payUrl, mock:false} }
 │                         │                              │
 │ 跳转 payUrl（GET）       │                              │
 │───────────────────────────────────────────────────────▶ 支付宝收银台
```

要点：

- 订单先落库，再生成支付 URL；支付 URL 生成失败会直接报错，不会留下「无法支付」的订单；
- 支付超时默认 `30m`（`timeout_express`）；
- 金额由服务端从套餐读取，前端不能传金额。

### 3.2 用户在支付宝完成支付

- 支付宝收银台负责登录、付款、风控；
- 支付成功后支付宝同时做两件事：
  1. 浏览器按 `ALIPAY_RETURN_URL` 跳回前台；
  2. 服务端按 `ALIPAY_NOTIFY_URL` 发起异步通知。
- **两者顺序不固定**，通知也可能重复推送，因此支付状态只由异步通知 / 主动查询驱动，浏览器回跳只用于体验。

### 3.3 异步通知

```
支付宝                         API                           RabbitMQ
 │  POST /api/orders/alipay/notify（表单）                      │
 │──────────────────────────────▶│ 解析表单参数                 │
 │                               │ verifyNotify：              │
 │                               │  - 签名 RSA2                │
 │                               │  - app_id 是否一致           │
 │                               │  - 金额是否与订单一致         │
 │                               │                              │
 │                               ├─ 验签失败 → 400 "failure"    │ ← 支付宝会重试
 │                               ├─ 非 paid 状态 → 200 "success"│ ← 等待付款 / 交易关闭
 │                               ├─ 成功 → publish payment.paid │
 │                               │──────────────────────────────▶│
 │◀──────────────────────────────│ 200 "success"（纯文本）       │
 │                               │                              │
 │                               │        MQ 消费端              │
 │                               │◀──────────────────────────────│
 │                               │ fulfillVipOrder（幂等）       │
 │                               │  → 标记 paid / 开通会员 / 通知 │
 │                               │  → 登记到期延时通知            │
```

关键约束：

- 响应必须是**纯文本** `success` / `failure`，不能是 JSON 包装；
- 非 `paid` 状态（`WAIT_BUYER_PAY` / `TRADE_CLOSED`）直接确认，避免支付宝持续重试；
- 成功通知先入队再响应，RabbitMQ confirm 保证消息已落盘；
- 重复通知不会重复开通会员，见 3.4。

### 3.4 幂等履约 `fulfillVipOrder`

```
BEGIN
  SELECT ... FROM pay_order WHERE order_no = ? FOR UPDATE
  ├─ 订单不存在            → 404
  ├─ biz_type != vip       → 400
  ├─ status = paid         → 直接返回 already=true（重复通知）
  ├─ status != created     → 400（退款 / 关闭后不再履约）
  ├─ 金额与订单不一致       → 400（通知响应 failure）
  UPDATE pay_order SET status='paid', trade_no=?, paid_at=NOW()
  UPDATE user SET role='vip',
       vip_expire_at = GREATEST(现有, NOW()) + vip_days
  INSERT user_notification（付费会员开通成功）
COMMIT
然后 scheduleVipExpiryNotice(userId)（事务外，失败只记日志）
```

为什么必须加锁：支付宝可能并发推送同一订单；`FOR UPDATE` + `status` 判断保证只有第一个事务真正开通会员。

### 3.5 支付回跳与前端轮询

支付宝按 `ALIPAY_RETURN_URL` 跳回 `/{membership}`，并附加 `out_trade_no` 等参数。

前台会员页：

1. 读取 `out_trade_no`；
2. 每 2 秒调用 `GET /api/orders/{orderNo}/status`，最多 10 次；
3. 状态变为 `paid` 后刷新用户信息与页面数据，并清理 URL 参数。

轮询只读本地 `pay_order`，不主动请求支付宝；正常情况异步通知会先到，轮询是兜底。

---

## 4. 异常与降级

| 场景 | 系统行为 | 结果 |
|---|---|---|
| 验签失败 / `app_id` 不匹配 | 通知返回 `failure` 400 | 支付宝重试；订单不履约 |
| 通知金额与订单不一致 | 通知返回 `failure` 500 | 支付宝重试；需人工排查 |
| 非成功状态通知 | 返回 `success` | 不履约，订单保持 `created` |
| RabbitMQ 不可用 / 未启用 | 通知处理内**同步履约** | 不丢单，响应前完成开通 |
| MQ 消费失败 | 消息重新入队（`requeueOnError`） | 幂等重试，直到成功 |
| 通知重复 | `fulfillVipOrder` 返回 `already` | 不重复开通，不重复叠加有效期 |
| 浏览器回跳但通知未到 | 前端轮询仍为 `created` | 权益暂不生效；需检查通知地址 |
| 订单已退款后收到旧通知 | `status != created` 直接拒绝 | 不会重新开通 |
| 私钥头 / 格式写错 | 服务端自动尝试 PKCS#8 / PKCS#1 | 使用实际可解析的格式签名 |

> 当前没有对「通知始终未送达」的订单做主动查询兜底。`@sylvie/payment` 已提供 `query()`，如需补强可增加定时任务：对超过 5 分钟仍为 `created` 的订单调用 `alipay.trade.query`，再走同一套幂等履约。

---

## 5. 配置

### 支付宝

```env
ALIPAY_MOCK=false
ALIPAY_APP_ID=2021xxxxxxxx
# PEM 换行用 \n 表示；也可以粘贴完整 PEM
ALIPAY_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
ALIPAY_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do
ALIPAY_NOTIFY_URL=http://localhost:3000/api/orders/alipay/notify
ALIPAY_RETURN_URL=http://localhost:3001/membership
ALIPAY_SIGN_TYPE=RSA2
# 兼容字段；私钥格式（PKCS1 / PKCS8）由服务端自动识别
ALIPAY_KEY_TYPE=PKCS8
```

- 沙箱网关固定为 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`；
- 生产网关替换为 `https://openapi.alipay.com/gateway.do`；
- 私钥只放服务端 Secret，不入库、不下发前端。

### 消息队列

```env
MQ_ENABLED=true
MQ_URL=amqp://sylvie:123456@rabbitmq:5672
MQ_QUEUE_PREFIX=sylvie
MQ_PREFETCH=1
```

队列：`${MQ_QUEUE_PREFIX}.payment.paid`，持久化队列 + 持久化消息。

---

## 6. 接口与响应

| 接口 | 鉴权 | 成功响应 | 失败响应 |
|---|---|---|---|
| `POST /api/orders/vip` | JWT | `{ code:200, data:{ order, payment:{ provider, mock, payUrl, message } } }` | 套餐不存在 404 / 支付未配置 503 |
| `GET /api/orders/{orderNo}/status` | JWT | `{ code:200, data: OrderDto }` | 非本人订单 404 |
| `POST /api/orders/alipay/notify` | 无（验签） | `text/plain: success` | `text/plain: failure` |
| `POST /api/orders/{orderNo}/pay` | JWT | 仅 `ALIPAY_MOCK=true` 可用 | 真实模式返回 400 |

`payment` 字段：

```ts
{
  provider: 'alipay',
  mock: boolean,
  payUrl: string | null,
  message: string
}
```

---

## 7. 模拟支付流程

用于本地 / 演示环境，不依赖支付宝与公网：

```
POST /api/orders/vip         → payUrl = /api/orders/{orderNo}/pay，mock=true
POST /api/orders/{orderNo}/pay → fulfillVipOrder(orderNo, MOCK...)
                               → 订单 paid、会员生效、通知写入
```

模拟支付同样会登记会员到期延时通知，方便联调到期相关逻辑。

---

## 8. 退款

后台退款（`POST /api/admin/orders/{id}/refund`）：

1. 校验订单为已支付的会员订单；
2. `pay_order.status = refunded`，写入 `refund_at` / `refund_reason`；
3. `user.role = member`、`vip_expire_at = NULL`（管理员除外）；
4. 写入权益收回通知；
5. 取消该用户的会员到期延时通知。

> 当前退款为**全额收回会员权益**，不按剩余天数折算；积分解锁订单暂不支持退款。

---

## 9. 安全与审计

- 私钥只存在服务端环境变量 / Secret 管理；
- 异步通知必须验签，并校验 `app_id` 与订单金额；
- 履约在同一数据库事务内完成，冗余字段与权益同步；
- 支付状态只由「异步通知 / 主动查询」驱动，不接受前端传状态；
- 通知处理日志包含 `orderNo` / `tradeNo` / `viaMq`，便于排查；
- 会员到期由 BullMQ「每 10 分钟扫描 + 到期延时通知」共同处理。
