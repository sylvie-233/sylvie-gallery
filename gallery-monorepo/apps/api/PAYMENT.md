# 希尔薇图集 API · 支付接入

支持两种模式：

| 模式 | 配置 | 行为 |
|---|---|---|
| 模拟支付（默认） | `ALIPAY_MOCK=true` | 创建订单后可调用 `POST /api/orders/{orderNo}/pay` 直接视为支付成功 |
| 支付宝沙箱 / 生产 | `ALIPAY_MOCK=false` + 密钥 | 跳转支付宝收银台，异步通知验签后通过 RabbitMQ 幂等履约 |

## 1. 沙箱配置

在支付宝开放平台「沙箱」应用中获取：

- AppID
- 应用私钥（推荐 PKCS8）
- 支付宝公钥

`.env`：

```env
ALIPAY_MOCK=false
ALIPAY_APP_ID=2021xxxxxxxx
# PEM 换行用 \n 表示；也可以粘贴完整的 -----BEGIN PRIVATE KEY----- 内容
ALIPAY_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
ALIPAY_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do
ALIPAY_NOTIFY_URL=http://localhost:3000/api/orders/alipay/notify
ALIPAY_RETURN_URL=http://localhost:3001/membership
ALIPAY_SIGN_TYPE=RSA2
# 兼容字段；服务端会自动识别私钥是 PKCS#1 还是 PKCS#8，无需手动对齐
ALIPAY_KEY_TYPE=PKCS8
```

> 私钥头与内容不一致（例如内容是 PKCS#1 却写成 `BEGIN PRIVATE KEY`）时，
> 服务端会自动按 PKCS#8 / PKCS#1 依次尝试解析，使用实际可行的格式签名。

> `ALIPAY_NOTIFY_URL` 必须能被支付宝公网访问。本地开发可用内网穿透（ngrok / cpolar 等）把 `/api/orders/alipay/notify` 映射到公网，或仅在沙箱收银台完成支付后用「主动查询 / 回跳轮询」验证前段链路。

## 2. 支付流程

```
前端 POST /api/orders/vip
        │
        ├─ ALIPAY_MOCK=true  → 返回模拟 payUrl，前端确认支付
        └─ 真实模式          → 返回支付宝收银台 URL，前端跳转
                                   │
支付宝异步通知 POST /api/orders/alipay/notify
        │
        ├─ 验签失败 → 响应 failure（支付宝会重试）
        ├─ 非成功状态 → 响应 success
        └─ 成功 → 发布 payment.paid 到 RabbitMQ
                     │
                 MQ 消费者 fulfillVipOrder（幂等）
                     ├─ 标记订单 paid
                     ├─ 开通 / 叠加会员
                     ├─ 写通知
                     └─ 登记会员到期延时任务
```

RabbitMQ 不可用时，通知处理会**同步履约兜底**，不会因为 MQ 故障丢单。

## 3. 相关配置

```env
MQ_ENABLED=true
MQ_URL=amqp://sylvie:123456@rabbitmq:5672
MQ_QUEUE_PREFIX=sylvie
MQ_PREFETCH=1
```

队列名：`${MQ_QUEUE_PREFIX}.payment.paid`。

## 4. 接口

| 接口 | 说明 |
|---|---|
| `POST /api/orders/vip` | 创建会员订单，返回 `payUrl` 与 `mock` 标记 |
| `GET /api/orders/{orderNo}/status` | 支付回跳后轮询订单状态（仅本人） |
| `POST /api/orders/alipay/notify` | 支付宝异步通知，表单提交，响应纯文本 |
| `POST /api/orders/{orderNo}/pay` | 仅模拟支付模式可用 |

## 5. 安全约定

- 私钥只放在服务端环境变量 / Secret 管理，不入库、不下发前端；
- 异步通知必须验签，并校验 `app_id` 与订单金额；
- 履约 `fulfillVipOrder` 是幂等的，支付宝重复通知不会重复开通会员；
- 金额统一使用「分」，与 `pay_order.amount_cents` 对齐。
