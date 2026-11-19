# @sylvie/notify

共享通知层：把「发邮件 / 发短信」收敛为统一入口，按**通道**组织。邮件与短信互不影响，未配置的通道自动跳过，发送失败只返回结果、不抛异常。

## 定位

- 向上提供稳定的 `SendResult` 契约，业务代码不需要关心 SMTP 或短信服务商细节；
- 包内**不读取环境变量**、不绑定日志实现、不绑定任何短信厂商 SDK；
- 适合验证码、通知类等「失败可降级、不应阻断主流程」的场景；
- 不负责重试、排队与模板管理，需要时由调用方或任务层（`@sylvie/job`）编排。

## 目录结构

```text
packages/notify/
├── src/
│   ├── index.ts      # 包入口：导出类型、通道实现与门面
│   ├── types.ts      # 公共类型：消息、配置、SendResult、SmsSender
│   ├── email.ts      # EmailChannel：基于 nodemailer 的 SMTP 实现
│   ├── sms.ts        # SmsChannel：调用注入的 SmsSender
│   └── notifier.ts   # Notifier 门面与 createNotifier
├── package.json
└── tsconfig.json
```

## 引入方式

工作区内通过包名引入：

```ts
import { createNotifier, type SendResult } from '@sylvie/notify';
```

需要单独使用某个通道时，也可以直接导入 `EmailChannel` / `SmsChannel`。

## 快速开始

```ts
import { createNotifier } from '@sylvie/notify';

const notifier = createNotifier({
  email: {
    host: '127.0.0.1', // 开发环境为 Mailpit；生产替换为真实 SMTP
    port: 1025,
    secure: false,
    // user / password 在需要认证的 SMTP 上填写
    from: '希尔薇图集 <noreply@sylvie.cc>',
  },
  sms: {
    // 具体服务商由调用方注入，包内不绑定 SDK
    send: async (message) => {
      const messageId = await aliyunSms.send(message);
      return { messageId };
    },
  },
});

// 邮件：成功 { ok: true, messageId }，失败 { ok: false, error }
const mailResult = await notifier.sendEmail({
  to: 'user@example.com',
  subject: '验证码',
  text: '你的验证码是 123456',
  html: '<p>你的验证码是 <b>123456</b></p>',
});

// 短信：纯文本或模板参数二选一
const smsResult = await notifier.sendSms({
  to: '13800000000',
  templateId: 'SMS_123',
  params: { code: '123456' },
});

if (!mailResult.ok || !smsResult.ok) {
  // 只记录 / 上报，不要因此中断主业务
}

notifier.close();
```

## API 概览

| API | 说明 |
|---|---|
| `createNotifier(options)` | 创建通知门面；`options` 可省略，省略时所有通道关闭 |
| `new Notifier(options)` | 与 `createNotifier` 等价，便于依赖注入 |
| `Notifier.sendEmail(message)` | 发送邮件；通道未配置时返回 `skipped=true` |
| `Notifier.sendSms(message)` | 发送短信；通道未配置时返回 `skipped=true` |
| `Notifier.enabled` | 是否至少有一个通道真正可用 |
| `Notifier.close()` | 关闭邮件连接池（短信资源由调用方管理） |
| `EmailChannel.send(message)` | 单独使用邮件通道 |
| `EmailChannel.close()` | 释放 SMTP 连接 |
| `SmsChannel.send(message)` | 单独使用短信通道，内部调用注入的 `SmsSender` |

## 类型说明

### SendResult

所有发送方法统一返回该结构，**从不抛异常**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `channel` | `'email' \| 'sms'` | 实际通道 |
| `ok` | `boolean` | 是否发送成功 |
| `skipped` | `boolean?` | 通道未配置时为 `true`，属于预期内的空操作 |
| `messageId` | `string?` | 服务商 / SMTP 返回的消息 ID |
| `error` | `string?` | 失败原因 |

状态组合：

- 通道未配置：`{ ok: false, skipped: true, error: '...通道未配置' }`
- 发送失败：`{ ok: false, error: '...' }`
- 发送成功：`{ ok: true, messageId? }`

### 消息与配置

- `EmailMessage`：`to` / `subject` / `text` 必填，`html`、`cc`、`bcc`、`replyTo` 可选。
- `SmsMessage`：`to` 必填，`text` 与 `templateId` + `params` 至少提供其一，否则返回失败结果。
- `EmailChannelOptions`：`host` 与 `from` 同时存在时通道才启用；`port` 默认 1025，`secure` 默认 `false`，连接 / 读写超时默认 5 秒。
- `SmsChannelOptions`：唯一字段 `send`，即注入的发送函数；未提供时通道关闭。

### SmsSender

```ts
type SmsSender = (
  message: SmsMessage,
) => Promise<{ messageId?: string } | void>;
```

- 成功返回 `messageId` 或 `void`；
- 失败直接抛错，由 `SmsChannel` 捕获并转为 `SendResult`；
- 接入新服务商只需在应用侧实现该函数。**注意：`SmsMessage.params` 的键名、模板 ID 格式均由服务商决定，本包不校验。**

## 设计边界

- **配置注入**：SMTP 参数、发件人与短信实现全部由调用方传入，包内不读环境变量。
- **通道隔离**：每个通道独立捕获错误并记录日志，单通道故障不影响另一通道。
- **失败不抛错**：任何发送失败都归一化为 `SendResult`，避免验证码等业务被邮件故障阻断。
- **未配置即跳过**：`skipped=true` 是正常状态而非错误，调用方无需提前判断通道是否存在。
- **不做重试 / 队列**：本包只负责一次发送；重试、异步化请使用任务层。
- **日志可选**：传入 `logger` 才会输出发送日志，日志内容包含收件人与主题，**不要传入验证码明文等敏感字段的额外 meta**。

## 配置

邮件通道（开发环境 Mailpit）：

| 配置 | 说明 |
|---|---|
| `SMTP_HOST` | SMTP 主机；留空时邮件通道关闭 |
| `SMTP_PORT` | 端口，开发环境 Mailpit 为 1025 |
| `SMTP_USER` / `SMTP_PASSWORD` | 需要认证时填写 |
| `SMTP_SECURE` | 是否使用 TLS，`'true'` 时开启 |
| `SMTP_FROM` | 发件人，如 `希尔薇图集 <noreply@sylvie.cc>` |

短信通道：当前未配置。接入服务商后在应用侧实现 `SmsSender` 并注入 `sms.send`，本包无需改动。

## 与 API 的集成位置

应用侧入口为 `apps/api/src/services/notify.service.ts`：

- 用 `createNotifier` 创建单例 `notifier`，根据 `SMTP_*` 环境变量决定是否启用邮件通道；
- 日志通过 `@sylvie/logger` 的 `moduleLogger('notify')` 适配后注入；
- `sendVerifyCodeMail()` 封装注册 / 找回密码验证码邮件，返回 `result.ok`，失败不影响业务流程；
- `closeNotifier()` 在进程退出时释放邮件连接；
- 开发环境所有邮件由 Mailpit 捕获（网页 `http://localhost:8025`，SMTP `localhost:1025`）。

## 注意事项

- 开发环境用 Mailpit 验证邮件；生产环境替换真实 SMTP，并确保发件域名完成 SPF / DKIM 配置。
- 邮件发送失败只记录日志，验证码流程仍会继续；排查时优先查看 Mailpit 或应用日志。
- 短信通常按条计费，接入后应在业务侧限流并做发送频率控制。
- 不要将 SMTP 密码、短信 AccessKey 写入代码或提交到仓库，统一通过环境变量注入。
- `notifier.close()` 应在进程退出时调用，避免连接池悬挂。
