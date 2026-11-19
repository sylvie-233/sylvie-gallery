# @sylvie/payment

支付宝支付封装，沙箱与生产共用同一套签名逻辑，只切换网关与密钥。

## 使用

```ts
import { createAlipayProvider } from '@sylvie/payment';

const alipay = createAlipayProvider({
  appId: '2021xxxx',
  privateKey,          // 应用私钥（PKCS8 / PKCS1）
  alipayPublicKey,     // 支付宝公钥，用于验签
  gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
  signType: 'RSA2',
  notifyUrl: 'https://api.example.com/api/orders/alipay/notify',
  returnUrl: 'https://example.com/membership',
});

// 生成收银台地址，前端跳转
const payment = alipay.createPagePayment({
  orderNo: 'SV202611190001',
  amountCents: 1900,
  subject: '希尔薇图集 · 付费会员月卡',
});
console.log(payment.payUrl);

// 异步通知验签 + 解析
const notification = alipay.parseNotify(formParams);
if (notification?.status === 'paid') {
  await fulfill(notification.orderNo, notification.tradeNo, notification.amountCents);
}

// 主动查询（回跳后兜底）
const query = await alipay.query('SV202611190001');
```

## 接口

| 方法 | 说明 |
|---|---|
| `createPagePayment` | 电脑网站支付 `alipay.trade.page.pay`，返回收银台 URL |
| `query` | `alipay.trade.query`，返回统一状态与实付金额（分） |
| `verifyNotify` | 校验异步通知签名，并检查 `app_id` |
| `parseNotify` | 验签后解析为统一 `PaymentNotification` |

状态统一为 `pending / paid / closed / unknown`；金额统一使用「分」。

## 沙箱配置

1. 在支付宝开放平台沙箱应用中获取 AppID、应用私钥、支付宝公钥；
2. 网关使用 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`；
3. `notifyUrl` 必须公网可达（本地开发可用内网穿透），`returnUrl` 为浏览器回跳地址；
4. 沙箱买家账号在沙箱控制台查看。

## 安全

- 私钥只通过服务端环境变量注入，不要提交到仓库或下发给前端；
- 异步通知必须验签，并校验 `app_id` 与订单金额；
- 履约逻辑必须幂等，支付宝会重复推送通知。
