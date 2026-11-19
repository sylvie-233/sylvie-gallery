# @sylvie/notify

共享通知层，按**通道**组织：邮件与短信互不影响，未配置的通道自动跳过。

## 使用

```ts
import { createNotifier } from '@sylvie/notify';

const notifier = createNotifier({
  email: {
    host: '127.0.0.1',        // 开发环境为 Mailpit
    port: 1025,
    from: '希尔薇图集 <noreply@sylvie.cc>',
    // user / password / secure 按生产 SMTP 配置
  },
  sms: {
    // 具体服务商由调用方注入，包内不绑定 SDK
    send: async (message) => {
      const id = await aliyunSms.send(message);
      return { messageId: id };
    },
  },
});

const result = await notifier.sendEmail({
  to: 'user@example.com',
  subject: '验证码',
  text: '你的验证码是 123456',
  html: '<p>你的验证码是 <b>123456</b></p>',
});

await notifier.sendSms({ to: '13800000000', templateId: 'SMS_123', params: { code: '123456' } });

notifier.close();
```

## 返回结果

所有发送方法都返回 `SendResult`，**不抛异常**：

```ts
{ channel: 'email' | 'sms', ok: boolean, skipped?: boolean, messageId?: string, error?: string }
```

- 通道未配置：`ok: false, skipped: true`
- 发送失败：`ok: false, error: '...'`
- 调用方可将 `!ok` 上报日志或监控，但不应中断主业务。

## 设计边界

- **配置注入**：包内不读取环境变量，SMTP 参数与短信实现均由调用方传入。
- **邮件**：基于 nodemailer，兼容 Mailpit、企业邮箱与云邮件服务；连接 / 读写超时默认 5 秒。
- **短信**：只定义 `SmsSender` 函数签名。后续接入阿里云 / 腾讯云时，在应用侧实现该函数并在 `createNotifier` 中注入，包本身无需改动。
- **失败隔离**：每个通道独立捕获错误并记录日志，单通道故障不影响其他通道。
- **关闭**：`notifier.close()` 释放邮件连接，短信通道由调用方管理。
