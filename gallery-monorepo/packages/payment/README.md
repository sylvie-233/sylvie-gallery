# @sylvie/payment

共享支付层：封装支付宝网页支付（电脑网站支付 `alipay.trade.page.pay`），收敛创建支付、主动查询、异步通知验签与退款。沙箱与生产共用同一套签名逻辑，只切换网关与密钥。

## 定位

- 向上提供统一的支付状态与金额单位，业务侧不直接接触支付宝 SDK；
- 负责签名、验签、字段映射与元 / 分转换等协议细节；
- **不负责**：订单落库、会员履约、金额校验、幂等业务处理，这些由 API 层完成；
- 后续接入微信支付时，实现 `PaymentProvider` 接口并在入口导出即可。

## 目录结构

```text
packages/payment/
├── src/
│   ├── index.ts   # 包入口：导出类型与支付宝实现
│   ├── types.ts   # 公共类型：配置、请求 / 结果、PaymentProvider 接口
│   └── alipay.ts  # AlipayProvider：支付宝签名、查询、验签与退款
├── package.json
└── tsconfig.json
```

## 引入方式

```ts
import {
  createAlipayProvider,
  type PaymentNotification,
  type PaymentStatus,
  type RefundResult,
} from '@sylvie/payment';
```

## 快速开始

```ts
import { createAlipayProvider } from '@sylvie/payment';

const alipay = createAlipayProvider({
  appId: '2021xxxx',
  privateKey,          // 应用私钥 PEM（PKCS8 / PKCS1），由调用方保证格式
  alipayPublicKey,     // 支付宝公钥 PEM，用于验签
  gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do', // 生产换正式网关
  signType: 'RSA2',
  keyType: 'PKCS8',
  notifyUrl: 'https://api.example.com/api/orders/alipay/notify',
  returnUrl: 'https://example.com/membership',
});

// 1) 创建支付：金额单位是「分」，provider 内部转为元
const payment = alipay.createPagePayment({
  orderNo: 'SV202611190001',
  amountCents: 1900,
  subject: '希尔薇图集 · 付费会员月卡',
});
console.log(payment.payUrl); // 前端跳到收银台

// 2) 异步通知：先验签解析，再校验金额并幂等履约
const notification = alipay.parseNotify(formParams);
if (!notification) {
  // 签名或 app_id 校验失败，直接拒绝
} else if (notification.status === 'paid') {
  await fulfillOnce(
    notification.orderNo,
    notification.tradeNo,
    notification.amountCents,
  );
}

// 3) 主动查询：支付回跳后的状态兜底
const query = await alipay.query('SV202611190001');
if (query.status === 'paid') {
  // 同样需要幂等履约
}

// 4) 退款：失败会抛错，调用方在成功前不要更新本地退款状态
const refund = await alipay.refund({
  orderNo: 'SV202611190001',
  tradeNo: '2026111922001400000001', // 有流水号时优先使用
  amountCents: 1900,
  reason: '用户申请退款',
  outRequestNo: 'SV202611190001',    // 退款幂等号，可省略，默认用 orderNo
});
```

## API 概览

| API | 说明 |
|---|---|
| `createAlipayProvider(options)` | 创建支付宝实例；缺少 `appId` / `privateKey` / `alipayPublicKey` 时抛错 |
| `AlipayProvider.createPagePayment(input)` | 电脑网站支付，同步返回收银台 URL |
| `AlipayProvider.query(orderNo)` | 主动查询交易状态；异常时返回 `unknown`，不抛错 |
| `AlipayProvider.refund(input)` | 发起退款；失败抛错，成功返回退款金额 |
| `AlipayProvider.verifyNotify(params)` | 校验异步通知签名与 `app_id`，返回布尔值 |
| `AlipayProvider.parseNotify(params)` | 验签后解析为 `PaymentNotification`；无效返回 `null` |

## 类型说明

### 金额单位

包内与对外**统一使用「分」**（整数）。与支付宝交互时：

- 创建支付 / 退款：分 → 元（`1900` → `"19.00"`）；
- 查询 / 通知：元 → 分（`"19.00"` → `1900`）。

非法或缺失金额返回 `null`，由调用方按「未知」处理。

### PaymentStatus

| 值 | 含义 | 支付宝状态 |
|---|---|---|
| `pending` | 等待买家付款 | `WAIT_BUYER_PAY` |
| `paid` | 已支付 | `TRADE_SUCCESS` / `TRADE_FINISHED` |
| `closed` | 交易关闭 | `TRADE_CLOSED` |
| `unknown` | 查询失败或非成功响应 | 其他 / 网络异常 |

### PaymentQueryResult

包含 `provider`、`status`、`tradeNo`、`amountCents`（分）与 `buyerId`；未知字段为 `null`。

### RefundResult

| 字段 | 说明 |
|---|---|
| `provider` | 固定为 `'alipay'` |
| `refundNo` | 本次退款使用的幂等号（`out_request_no`），可用于对账 |
| `amountCents` | 实际退款金额（分）；支付宝未返回时取请求金额 |

### PaymentNotification

| 字段 | 说明 |
|---|---|
| `orderNo` | 商户订单号 `out_trade_no` |
| `tradeNo` | 支付宝交易流水号 `trade_no` |
| `status` | 映射后的统一状态 |
| `amountCents` | 通知中的订单金额（分） |
| `raw` | 原始通知参数，便于排查与落库 |

### 请求类型

- `CreatePagePaymentInput`：`orderNo`、`amountCents`（分）、`subject` 必填，`body` 与 `timeoutMinutes`（默认 30 分钟）可选。
- `RefundPaymentInput`：`orderNo`、`amountCents` 必填；`tradeNo` 优先、缺失时回退 `orderNo`；`outRequestNo` 为退款幂等号，默认等于 `orderNo`。

## 设计边界

- **只封装协议**：验签、字段映射、元 / 分转换在本包；金额比对、订单状态推进、会员开通由 API 层负责。
- **密钥格式由调用方负责**：本包不做 PEM 格式修复或自动识别。`.env` 中 `\n` 转义、PKCS#1 / PKCS#8 归一化都在 `apps/api/src/services/payment.service.ts` 完成。
- **查询不抛错**：网络异常或支付宝返回非成功码时返回 `status: 'unknown'`，避免回跳页因查询失败白屏。
- **退款必须抛错**：退款失败时抛错，调用方据此保持本地订单不变，防止「本地已退款、支付宝未退」。
- **通知只做解析**：`parseNotify` 只验签并解析字段，不校验金额、不做幂等；重复通知由调用方按订单号幂等处理。
- **沙箱与生产同构**：仅 `gateway` 与密钥不同，签名算法、请求参数完全一致。

## 配置

| 配置 | 说明 |
|---|---|
| `appId` | 开放平台应用 AppID |
| `privateKey` | 应用私钥 PEM（PKCS8 / PKCS1），调用方保证格式 |
| `alipayPublicKey` | 支付宝公钥 PEM，用于验签 |
| `gateway` | 网关；沙箱 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`，生产为正式网关 |
| `signType` | `RSA2`（默认）或 `RSA` |
| `keyType` | `PKCS8`（默认）或 `PKCS1`，需与实际私钥一致 |
| `notifyUrl` | 异步通知地址，必须公网可达 |
| `returnUrl` | 支付完成后浏览器回跳地址 |
| `timeoutMs` | 请求支付宝网关超时，默认 10 秒 |

本地开发默认 `ALIPAY_MOCK=true`，不请求真实网关；设置 `ALIPAY_MOCK=false` 并补齐 `ALIPAY_*` 密钥后走沙箱。

## 与 API 的集成位置

应用侧入口为 `apps/api/src/services/payment.service.ts`：

- 启动时按 `ALIPAY_MOCK` 与密钥是否齐全决定是否创建 provider；
- `normalizePrivateKey` / `normalizePublicKey` 负责 PEM 换行与 PKCS#1 / PKCS#8 归一化——**这些修复逻辑不在本包内**；
- `createAlipayPagePayment()` 创建收银台地址；
- `parseAlipayNotify()` 验签解析异步通知；
- `queryAlipayPayment()` 回跳后查询兜底；
- `refundAlipayPayment()` 发起真实退款；
- `realPaymentEnabled` / `paymentMode()` 暴露当前支付模式（`mock` / `alipay` / `unconfigured`）。

履约链路：异步通知 → 验签 → 金额校验 → MQ 异步履约（不可用时同步兜底）→ 幂等标记已支付并开通会员。

## 注意事项

- **密钥安全**：私钥只通过服务端环境变量注入，绝不提交仓库或下发前端；支付宝公钥可公开，但不要与商户私钥混淆。
- **必须验签**：异步通知先 `verifyNotify` / `parseNotify`，并校验 `app_id`；未验签的通知一律丢弃。
- **校验金额**：通知中的 `amountCents` 必须与本地订单金额一致，避免金额篡改。
- **履约幂等**：支付宝会重复推送通知，按 `orderNo` 幂等处理，重复通知返回成功即可。
- **退款幂等**：`out_request_no` 是退款幂等号，同一订单重复退款务必复用；默认取 `orderNo`。
- **退款优先流水号**：有 `tradeNo` 时优先使用，缺失才回退 `out_trade_no`，可减少订单号歧义。
- **退款失败不回滚本地**：`refund` 抛错时不得把本地订单标记为已退款；确认支付宝成功后，再更新退款状态。
- **沙箱限制**：沙箱买家账号、可用金额与真实环境不同；`notifyUrl` 需公网可达，本地开发可用内网穿透。
